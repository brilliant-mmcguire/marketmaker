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
const qtyLadder = [197, 157, 89, 43, 29, 13, 11];  

const tickSize = 0.0001;  // Tick Size is 1 basis point.

const threshold = {
    upperPrice : 1.0010,
    lowerPrice : 0.9990,
    upperTarget : 1100, // Hold less USDC when its price is high in anticipation of mean reversion.  
    lowerTarget : 2700, // Buy more USDC when its price is low. 
    long : +400,
    overBought : +800,
    short : -400,
    overSold : -800
};

/* 
Quntity Quantum is used to place orders in proportion to the volume of orders at a given price level.
This is the help regulate the rate of exection of our orders. 
The more orders are in queue ahead of us, the more orders we need to keep in the queue.
The goal is to maintin a steady rate of execution and to baclance to rate of buy and sell trades. 
*/
const qtyQuanta = [212345, 712345 , 2523456, 6523456, 11123456, 100123456];

/*
Target USDC balance uses a linear function between the upper and lower quantity thresholds.
At the upper threshold we can tolerate a smaller position in the expectation of prices falling again. 
At the lower threshold we allow for a larger position, expecting a price increase in the near future.
*/
function targetQty(bestPrice) {
    let qty = 0.5*(threshold.upperTarget + threshold.lowerTarget); 
    let prc = bestPrice;

    prc = (bestPrice > threshold.upperPrice) ? threshold.upperPrice : bestPrice;
    prc = (bestPrice < threshold.lowerPrice) ?  threshold.lowerPrice : bestPrice;
    
    qty = ( threshold.lowerTarget * (threshold.upperPrice - prc) 
            + 
            threshold.upperTarget * (prc - threshold.lowerPrice) )
        / (threshold.upperPrice-threshold.lowerPrice);

    console.log(`Target Qty: ${qty} based on best price ${bestPrice}` )
    return qty;
}

async function makeBids(bestBids, allOrders, position, balances) {
    
    console.log(`Making bids for ${symbol} at ${new Date()}`);

    let usdcTotal = balances.usdc.total;
    
    let prcCeiling = position.mAvgSellPrice; // Avoid buying back at a loss relative to our recent sells. 

    let prcFloor = bestBids[2].price;
    let targetQ = targetQty(bestBids[0].price);
    
    if(usdcTotal > targetQ) { 
        // Long on USDC so aim to improve on recent avg buy price. 
        prcCeiling = Math.min(position.mAvgBuyPrice,bestBids[0].price);
        
        if(usdcTotal > (targetQ+threshold.overBought)) {
            console.log(`Overbought  posn of ${usdcTotal} at an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
            // We can be more demading on price and lower our buy ceiling.
            prcCeiling -= 3*tickSize; 
        } else if(usdcTotal > (targetQ + threshold.long)) {
            console.log(`Long posn of  ${usdcTotal} at an avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
            // Avoid buying unless we can improve our average price.
            prcCeiling -= 1.5*tickSize;
        }
    } 
    
    if(usdcTotal < targetQ) { 
        // Short on USDC so aim to not buy back at a loss on recent avg buy prices. 
        prcCeiling = Math.min(position.mAvgSellPrice,bestBids[0].price);

        if(usdcTotal < (targetQ + threshold.overSold)) {
            console.log(`Oversold posn of  ${usdcTotal} at an recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
            // We may need to buy at a loss as we are severely over-sold and running out of USDC.
            prcCeiling += 3*tickSize;
        } else if(usdcTotal < (targetQ + threshold.short)) {
            console.log(`Short posn of ${usdcTotal} at an avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
            // Buy back at a slight loss is necessSary. 
            prcCeiling += 1.5*tickSize;
        }
    }

    // Testing a strategy to encourage a short position when price increases.
    // Enforce bid to be at least one tick away from the current best bid. 
    if((bestBids[0].price) > 1.0004) { 
        prcCeiling = Math.min(bestBids[0].price - tickSize,prcCeiling);
    }

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
    
    if (usdcTotal < targetQ) {
        // We are short already so want to match or improve on our average sell price.
        prcFloor = Math.max(position.mAvgSellPrice,bestOffers[0].price);

        // Order price floor adjustments.
        if(usdcTotal < (targetQ + threshold.overSold)) {
            console.log(`Oversold posn of ${usdcTotal} at a recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
            // We can be more demading on price and raise our price floor.
            prcFloor += 3*tickSize;  
        
        } else if(usdcTotal < (targetQ + threshold.short)) {
            console.log(`Short posn of ${usdcTotal} at an recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
            // Avoid selling unless we can improve our average price.
            prcFloor += 1.5*tickSize;  
        }
    }
    
    if (usdcTotal > targetQ) {
        // We are long so want to sell even if at cost or at a loss.
        prcFloor = position.mAvgBuyPrice 

        if(usdcTotal > (targetQ + threshold.overBought)) {
            console.log(`Over bought at ${usdcTotal} an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
            // We may need to sell at a loss as we are severely over-bought and running out of USDT.
            prcFloor -= 3*tickSize; 
        } else if(usdcTotal > (targetQ + threshold.long)) {
            console.log(`Long posn of ${usdcTotal} bought at an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
            // Sell back at a slight loss if necessary. 
            prcFloor -= 1.5*tickSize; 
        }
    }
    // Testing a strategy to encourage a long position when price drops. 
    // Default bid is one tick away from the current best bid. 
    if((bestOffers[0].price) < 0.9996) { 
        prcFloor = Math.max(bestOffers[0].price + tickSize, prcFloor);
    }

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
