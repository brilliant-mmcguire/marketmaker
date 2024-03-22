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

const { fetchOpenOrders, cancelOrder } = require('./orderTxns');
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
const qtyLadder = [163, 131, 89, 67, 53, 37, 23];  

const threshold = { 
    //overSold : 1000, 
    //short : 1500,
    //long : 2000,
    //overBought : 2500 
    target : 2000, 
    long : + 500, 
    overBought : +1000, 
    short : -500, 
    overSold : -1000
};

/* 
Quntity Quantum is used to place orders in proportion to the volume of orders at a given price level.
This is the help regulate the rate of exection of our orders. 
The more orders are in queue ahead of us, the more orders we need to keep in the queue.
The goal is to maintin a steady rate of execution and to baclance to rate of buy and sell trades. 
*/
const qtyQuanta = [212345, 512345, 812345, 1123456, 3123456, 6123456, 100123456];

async function makeBids(bestBidPrices, allOrders, position, balances) {
    
    console.log(`Making bids for ${symbol} at ${new Date()}`);

    let usdcTotal = balances.usdc.total;

    let prcCeiling = position.mAvgSellPrice; // Avoid buying back at a loss relative to our recent trades. 

    // Order price ceiling adjustments.
    if(usdcTotal > (threshold.target+threshold.overBought)) {
        console.log(`Overbought at an avg cost price of ${position.costPrice}`);
        // We can be more demading on price and lower our buy ceiling. 
        prcCeiling = position.mAvgBuyPrice - 0.0003; 
    } else if(usdcTotal > (threshold.target + threshold.long)) {
        console.log(`Long posn at an avg cost price of ${position.costPrice}`);
        // Avoid buying unless we can improve our average price.
        prcCeiling = position.mAvgBuyPrice - 0.00015;
    }
    if(usdcTotal < (threshold.target + threshold.overSold)) {
        console.log(`Over sold at an average price of ${position.costPrice}`);
        // We may need to buy at a loss as we are severely over-sold and running out of USDC.
        prcCeiling = position.mAvgSellPrice + 0.0003;
    } else if(usdcTotal < (threshold.target + threshold.short)) {
        console.log(`Short posn at an average price of ${position.costPrice}`);
        // Buy back at a slight loss is necessary. 
        prcCeiling = position.mAvgSellPrice + 0.00015;
    }
    
    let prcFloor = bestBidPrices[2].price;
    
    console.log(`Buy price ceiling: ${prcCeiling} and floor: ${prcFloor}`);
    
    //cancel any open orders exceeding the price ceiling and fallen under the price floor. 
    let staleOrders = allOrders.filter(order => (
        (parseFloat(order.price)>prcCeiling) || (parseFloat(order.price)<prcFloor)
        ));
    if(staleOrders.length>0) {
         console.log(`Cancel orders above price ceiling`);
         await cancelOrders(staleOrders);
    }
    
    for(let i = 0; i< bestBidPrices.length; i++) {
        let bid = bestBidPrices[i];
        let qty = qtyLadder[i];
        
        let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
 
        let freshOrders = false;
        if (orders.length>0) { 
            const xxMinutes = 16; // Minimum number of minutes bewteen orders at a give price level.
            const xxMilliSeconds = xxMinutes * 60 * 1000; 
            freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMilliSeconds);
        }
        
        let quotaFull = (bid.qty < qtyQuanta[orders.length]);

        console.log(
            `We have ${orders.length} orders on price level ${bid.price} with volume ${bid.qty}.}`
            );
        
        if(bid.price > prcCeiling || bid.price < prcFloor || quotaFull || freshOrders) {
            console.log(`> Ignoring price level ${bid.price}`);
            console.log(`> quotaFull: ${quotaFull}`); 
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

    console.log(`Making offers for ${symbol}  at ${new Date()}`);

    let usdcTotal = balances.usdc.total;

    let prcFloor = position.mAvgBuyPrice; // Avoid selling back at a loss relative to our recent trades.

    // Order price floor adjustments.
    if(usdcTotal < (threshold.target + threshold.overSold)) {
        console.log(`Oversold at an avg cost price of ${position.costPrice}`);
        // We can be more demading on price and raise our price floor.
        prcFloor = position.mAvgSellPrice + 0.0003; 

    } else if(usdcTotal < (threshold.target + threshold.short)) {
        console.log(`Short posn at an avg cost price of ${position.costPrice}`);
        // Avoid selling unless we can improve our average price.
        prcFloor = position.mAvgSellPrice + 0.00015;
    }
    if(usdcTotal > (threshold.target + threshold.overBought)) {
        console.log(`Over bought at an average price of ${position.costPrice}`);
        // We may need to sell at a loss as we are severely over-bought and running out of USDT.
        prcFloor = position.mAvgBuyPrice - 0.0003; 
    } else if(usdcTotal > (threshold.target + threshold.long)) {
        console.log(`Long posn at an average price of ${position.costPrice}`);
        // Sell back at a slight loss if necessary. 
        prcFloor = position.mAvgBuyPrice - 0.00015; 
    }

    let prcCeiling = bestOffers[2].price;
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
            const xxMinutes = 11 * 60 * 1000; // Ten minutes in milliseconds
            freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMinutes);
        }

        let quotaFull = (offer.qty < qtyQuanta[orders.length]);

        console.log(`We have ${orders.length} orders on price level ${offer.price} with volume ${offer.qty}.`);      
               
        if(offer.price < prcFloor || offer.price > prcCeiling || quotaFull || freshOrders) {
            console.log(`> Ignoring price level ${offer.price}`);
            console.log(`> quotaFull: ${quotaFull}`); 
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
