/*
Refresh orders for USDCUSDT trading pair.

The objective is to keep a certain number of orders on the bid and offer, 
within the min-max bounds.

Let's say we keep 3 orders active at each price level.  
Don't want to cancel orders becase we'd lose our position in the order book. 

Use expontnetial moving average of our recent trades to control bid/offer prices.
There is a risk of this getting stuck at high or low prices outside the current price range. 
TODO - analyse and test this 'getting stuck' scenario. 
*/

const { fetchOpenOrders } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchPriceDepth } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');
const { cancelOrders } = require('./orderTxns');
const { fetchAccountInfo } = require('./accountTxns');

const symbol = 'USDCUSDT';

/*
Use a quantity ladder to place smaller orers away from the current touch price. 
This is to reduce the impact of sharp price moves where the proce shoots through and 
remains at high/low levels for some period of time.  In this scenario we become 
oversold/overbought too quickly. 
*/
const qtyLadder = [197, 167, 101, 43, 29, 13, 11];  

const tickSize = 0.0001;  // Tick Size is 1 basis point.
const posLimit = 900  // aim to remain inside targetQ +- posLimit

const target = {
    hiPrice : 1.0010,
    loPrice : 0.9990,
    hiQty : 1200, // Hold less USDC when its price is high in anticipation of mean reversion.  
    loQty : 2800, // Buy more USDC when its price is low. 
};

/* 
Quntity Quantum is used to place orders in proportion to the volume of orders at a given price level.
This is the help regulate the rate of exection of our orders. 
The more orders are in queue ahead of us, the more orders we need to keep in the queue.
The goal is to maintin a steady rate of execution and to baclance to rate of buy and sell trades. 
*/
const qtyQuanta = [212345, 712345 , 2523456, 6523456, 11123456, 100123456];

/*
Target USDC balance uses a linear function between the upper and lower target quantities.
At the upper target we can tolerate a smaller position in the expectation of prices falling again. 
At the lower target we allow for a larger position, expecting a price increase in the near future.
*/
function targetQty(bestPrice) {
    let qty = 0.5*(target.hiQty + target.loQty); 
    let prc = bestPrice;

    prc = (bestPrice > target.hiPrice) ? target.hiPrice : bestPrice;
    prc = (bestPrice < target.loPrice) ?  target.loPrice : bestPrice;
    
    qty = ( target.loQty * (target.hiPrice - prc) 
            + 
            target.hiQty * (prc - target.loPrice) )
        /  (target.hiPrice-target.loPrice);

    console.log(`Target Qty: ${qty} based on best price ${bestPrice}` )
    return qty;
}

async function makeBids(bestBids, allOrders, position, balances) {
    
    console.log(`Making bids for ${symbol} at ${new Date()}`);

    let usdcTotal = balances.usdc.total;
    
    let prcCeiling = position.mAvgSellPrice; // Avoid buying back at a loss relative to our recent sells. 

    let prcFloor = bestBids[2].price;
    let targetQ = targetQty(bestBids[0].price);

    let posn = (usdcTotal - targetQ)/posLimit;
    let adjustment = 3*tickSize * posn * Math.abs(posn);

    if(usdcTotal > targetQ) { 
        // Long on USDC so aim to improve on recent avg buy price. 
        prcCeiling = Math.min(position.mAvgBuyPrice,bestBids[0].price); 
        console.log(`Long posn of ${usdcTotal} at an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);    
    } else { // (usdcTotal <= targetQ) { 
        // Short on USDC so buy back, even if at cost or at a loss.
        prcCeiling = position.mAvgSellPrice;    
        console.log(`Short  posn of ${usdcTotal} at an recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
    }

    prcCeiling -= adjustment; 
    console.log(`Price ceiling ${prcCeiling} with an adjustment of ${adjustment}} and scaled posn ${posn}`);
    
    /*
    // Testing a strategy to encourage a short position when price increases.
    // Enforce bid to be at least one tick away from the current best bid. 
    if((bestBids[0].price) > 1.0004) { 
        prcCeiling = Math.min(bestBids[0].price - tickSize,prcCeiling);
    }
    */

    console.log(`Buy price ceiling: ${prcCeiling} and floor: ${prcFloor}`);

    //cancel any open orders exceeding the price ceiling and fallen under the price floor. 
    let staleOrders = allOrders.filter(order => (
        (parseFloat(order.price)>prcCeiling) || (parseFloat(order.price)<prcFloor)
        ));
    if(staleOrders.length>0) {
         console.log(`Cancel orders above price ceiling`);
         await cancelOrders(staleOrders);
    }
    
    for(let i = 0; i< bestBids.length; i++) {
        let bid = bestBids[i];
        let qty = qtyLadder[i];
        
        let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
 
        let freshOrders = false;
        if (orders.length>0) { 
            const xxMinutes = 11; // Minimum number of minutes bewteen orders at a give price level.
            const xxMilliSeconds = xxMinutes * 60 * 1000; 
            freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMilliSeconds);
        }
        
        let quotaFull = (bid.qty < qtyQuanta[orders.length]);
        let quotaBreach = orders.length > 0 ? (bid.qty < qtyQuanta[orders.length-1]) : false;
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach ${bid.qty} and cancelling last order.`);
        }

        console.log(
            `We have ${orders.length} orders on price level ${bid.price} with volume ${bid.qty}.`
            );
        
        if(bid.price > prcCeiling || bid.price < prcFloor || quotaFull || freshOrders) {
            console.log(`> Ignoring price level ${bid.price}`);
            console.log(`> quotaFull: ${quotaFull}, breach: ${quotaBreach}`); 
            console.log(`> freshOrders: ${freshOrders}`);
        } else {
            console.log(`Placing buy order at price level ${bid.price}.`);
            try {
                joinBid = await placeOrder(
                    'BUY', 
                    qty, 
                    symbol, 
                    bid.price
                );
                console.log(`Buy order placed:`, joinBid);   
                break;  // Throttle to only one order at a time.   
            } catch (error) {
                console.error(error.message);
            }
        }
    };
}

async function makeOffers(bestOffers, allOrders, position, balances) {

    console.log(`Making offers for ${symbol} at ${new Date()}`);

    let usdcTotal = balances.usdc.total;

    let prcFloor = position.mAvgBuyPrice; // Avoid selling back at a loss relative to our recent trades.   

    let prcCeiling = bestOffers[2].price;
    let targetQ = targetQty(bestOffers[0].price);
    
    let posn = (usdcTotal - targetQ)/posLimit;
    let adjustment = 3*tickSize * posn * Math.abs(posn);

    if (usdcTotal < targetQ) {
        // We are short already so want to match or improve on our average sell price.
        prcFloor = position.mAvgSellPrice;
        console.log(`Short posn of ${usdcTotal} at an recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
    } else { // (usdcTotal >= targetQ) {
        // We are long so want to sell even if at cost or at a loss.
        prcFloor = Math.max(position.mAvgBuyPrice,bestOffers[0].price);
        console.log(`Long posn of ${usdcTotal} at an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
    }

    prcFloor -= adjustment; 
    console.log(`Price floor ${prcFloor} with an adjustment of ${adjustment} and scaled posn ${posn}`);
    
    /*
    // Testing a strategy to encourage a long position when price drops. 
    // Default bid is one tick away from the current best bid. 
    if((bestOffers[0].price) < 0.9996) { 
        prcFloor = Math.max(bestOffers[0].price + tickSize, prcFloor);
    }
    */

    console.log(`Sell price floor: ${prcFloor} and ceiling: ${prcCeiling}`)
    
    //cancel any open orders exceeding the price ceiling or fallen under the price floor. 
    let staleOrders = allOrders.filter(order => (
        (parseFloat(order.price)<prcFloor) || (parseFloat(order.price)>prcCeiling)
        ));

    if(staleOrders.length>0) {
         console.log(`Cancel orders below price floor`);
         await cancelOrders(staleOrders);
    }    
    
    for(let i = 0; i< bestOffers.length; i++) {
        let offer = bestOffers[i];
        let qty = qtyLadder[i];

        let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
        
        let freshOrders = false;
        if (orders.length>0) { 
            const xxMinutes = 11; // Minimum number of minutes bewteen orders at a give price level.
            const xxMilliSeconds = 11 * 60 * 1000; // Ten minutes in milliseconds
            freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMilliSeconds);
        }

        let quotaFull = (offer.qty < qtyQuanta[orders.length]);
        let quotaBreach = orders.length > 0 ? (offer.qty < qtyQuanta[orders.length-1]) : false;
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach ${offer.qty} and cancelling last order.`);
        }

        console.log(`We have ${orders.length} orders on price level ${offer.price} with volume ${offer.qty}.`);      
               
        if(offer.price < prcFloor || offer.price > prcCeiling || quotaFull || freshOrders) {
            console.log(`> Ignoring price level ${offer.price}`);
            console.log(`> quotaFull: ${quotaFull}, breach: ${quotaBreach}`); 
            console.log(`> freshOrders: ${freshOrders}`);
        } else {
            console.log(`Placing sell order at price level ${offer.price}.`);
            try {
                joinOffer = await placeOrder(
                    'SELL', 
                    qty, 
                    symbol, 
                    offer.price
                );
                console.log(`Sell order placed:`, joinOffer);   
                break;  // Throttle to only one order at a time.   
            } catch (error) {
                console.error(error.message);
            }
        }  
    };
}


exports.placeSCoinOrders = placeSCoinOrders;
async function placeSCoinOrders() {
   try {
    console.log("Fetching best offer prices.");
    const prcDepth = await fetchPriceDepth(symbol);

    const noneZeroBalances =  await fetchAccountInfo();
    let balances = {
       usdc : noneZeroBalances.balances.filter(balance => (balance.asset=='USDC'))[0],
       usdt : noneZeroBalances.balances.filter(balance => (balance.asset=='USDT'))[0]
    }
    
     console.log("Fetching open orders and position");
     const allOrders = await fetchOpenOrders(symbol);
     const position = await fetchPositions(symbol, 1);

     makeBids(
        prcDepth.bids, 
        allOrders.filter(order => (order.side==='BUY')), 
        position, 
        balances);
     makeOffers(
        prcDepth.asks, 
        allOrders.filter(order => (order.side==='SELL')), 
        position,
        balances); 
   } catch (error) {
     console.error(error.message);
   }
}

if (require.main === module) placeSCoinOrders();
