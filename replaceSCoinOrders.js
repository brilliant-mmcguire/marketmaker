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
const { fetchPriceStats } = require('./marketDataTxns');

const symbol = 'USDCUSDT';

/*
Use a quantity ladder to place smaller orers away from the current touch price. 
This is to reduce the impact of sharp price moves where the proce shoots through and 
remains at high/low levels for some period of time.  In this scenario we become 
oversold/overbought too quickly. 
*/
//const qtyLadder = [211, 199, 149, 43, 29, 13, 11];  
const qtyLadder = [113, 109, 107, 31, 19, 13, 11];  

const tickSize = 0.0001;  // Tick Size is 1 basis point.
const posLimit = 900  // aim to remain inside targetQ +- posLimit

const target = {
    hiPrice : 1.0010,  //
    loPrice : 0.9990,  // 
    hiQty : 1000, // Hold less USDC when its price is high in anticipation of mean reversion.  
    loQty : 3000, // Buy more USDC when its price is low. 
};

/* 
Quntity Quantum is used to place orders in proportion to the volume of orders at a given price level.
This is the help regulate the rate of exection of our orders. 
The more orders are in queue ahead of us, the more orders we need to keep in the queue.
The goal is to maintin a steady rate of execution and to baclance to rate of buy and sell trades. 
*/
// const qtyQuanta = [212345, 623456 , 1123456, 5123456, 11123456, 100123456];

/*
Target USDC balance uses a linear function between the upper and lower target quantities.
At the upper target we can tolerate a smaller position in the expectation of prices falling again. 
At the lower target we allow for a larger position, expecting a price increase in the near future.

Try using a signmoid funtion instead?  
Not sure if there is much benifit; can't think of a godd rationale but feels right.  
*/
function targetQty(bestPrice) {
    /*  Price	Target
        1.0015	2954.0
        1.0010	2848.3
        1.0005	2554.6
        1.0003	2358.4
        1.0001	2124.4
        1.0000	2000.0
        0.9999	1875.6
        0.9997	1641.6
        0.9995	1445.4
        0.9990	1151.7
        0.9985	1046.0 */ 
    // 0.25 -> About 90% of hiQty at hiPrice. 
    const prcDeviation = 0.25*(bestPrice-1.0)/tickSize; 
    const qZero =  target.loQty;
    const qMax = target.hiQty - target.loQty;
    const qty = qZero + qMax*sigmoid(prcDeviation);
    return qty;
}
/*
function pwLinear() {   // PIECEWISE LINEAR. 
    //let qty = 0.5*(target.hiQty + target.loQty); 
    //let prc = bestPrice;
    prc = (bestPrice > target.hiPrice) ? target.hiPrice : bestPrice;
    prc = (bestPrice < target.loPrice) ?  target.loPrice : bestPrice;
    
    qty = ( target.loQty * (target.hiPrice - prc) 
            + 
            target.hiQty * (prc - target.loPrice) )
        /  (target.hiPrice-target.loPrice);
    return qty;
}
*/
function sigmoid(x) {
    /*  Expected outputs:
        10	1.0000
         5	0.9933
         3	0.9526
         1	0.7311
         0	0.5000
        -1	0.2689
        -3	0.0474
        -5	0.0067
       -10	0.0000*/
    return 1 / (1 + Math.exp(-x));
}

// qtyQuanta = [212345, 623456 , 1123456, 5123456, 11123456, 100123456];
function quoteQuota(mktQuoteSize) {
/*  108,731	    0 (from 1)
    295,562	    2
    803,421	    3
    2,183,926	4
    5,936,526	5
    16,137,152	6
    43,865,326	7
    119,238,319	8 */
    
    const scaleQuoteSize = 30000; 
    const normalisedQuoteSize = mktQuoteSize / scaleQuoteSize; 
    
    const logQuoteSize =
        normalisedQuoteSize >= 1 ?  Math.log(normalisedQuoteSize) : 0;

    if (logQuoteSize<2) return 0; // avoid placing orders into small quote sizes.
    return Math.round(logQuoteSize - 0.5); /*round up*/

    /*
    const qtyQuanta = [212345, 623456 , 1123456, 5123456, 11123456, 100123456];
    let max = 0; 
    for(let i = 0; i < qtyQuanta.length-1; i++) {
        if (mktQuoteSize >= qtyQuanta[i]) max = i+1;
    };
    return max;
    */
}

function taperTradePrice(tradePrice, tradeAge, mktPrice) {
    // Weight our avg trade price with the market price depending on the age of our trades. 
    // If we have'd traded for a while (up to 2 hours), 
    // we tend to the hourly weighted market price.   
    const lifeTime = 2.0; // hours.
    const ageScalar = Math.sqrt(Math.max(2.0 - tradeAge,0)/2.0); 
    console.assert(ageScalar<=1.0 && ageScalar >=0.0 ,`0 <= trade age scalar <= 1`);
    return ageScalar*tradePrice + (1.0-ageScalar)*mktPrice; 
}

function quotePriceAdjustment(normalisedDeviation) { 
    /*  DEV   OLD   NEW ADJUSTMENT  
        +1.5 -6.75 -6.75
        +1.0 -3.00 -2.00 
        +0.5 -0.75 -0.25
        +0.0 +0.00 +0.00
        -0.5 +0.75 +0.25
        -1.0 +3.00 +2.00
-       -1.5 +6.75 +6.75 */
    return -2.0 * tickSize * normalisedDeviation**3;
}

function hasFreshOrders(orders) {
    const orderCount = orders.length;
    let freshOrders = false;
    if (orderCount>0) { 
        const lastOrderTime = orders[orderCount-1].time;
        const xxMinutes = orderCount*3; // Minimum number of minutes bewteen orders at a give price level.
        const xxMilliSeconds = xxMinutes * 60 * 1000; // Ten minutes in milliseconds
        freshOrders = ((Date.now() - lastOrderTime) < xxMilliSeconds);
    }
    return freshOrders;
}

async function makeBids(bestBids, allOrders, position, params) {
    console.log(`Making bids for ${symbol} at ${new Date()}`);

   // let usdcTotal = params.coinQty;
    let deviation = params.deviation;
    
    let prcFloor = bestBids[2].price;
  
  //  taperBuyPrice = params.avgBuy.taperPrice;
  //  taperSellPrice = params.avgSell.taperPrice; 

    let taperPrice = params.avgBuy.taperPrice;

    /* 
    Do we need this? 
    The risk is the price moves up, we have a low avg buy price and so don't try to buy back. 
    The adjustment and tapering should, between them, take care of it.  Shouldn't it? 

    if (deviation < -0.5) { // (usdcTotal < targetQ) { 
        // Short on USDC so buy back, even if at cost or at a loss.
        taperPrice = taperSellPrice;
        console.log(`Oversold ${usdcTotal} at recent avg price of ${position.mAvgSellPrice} (${position.mAvgSellAge} hrs)`);
    }
    */

    // If mkt price falls below recent buy price we want to switch to
    // ceiling based on mkt price and apply position adjustment to that.  
    let prcCeiling = Math.min(taperPrice,params.mktPrice); 

    // Adjust price ceiling to allow for position deviation.  
    // If we are overweight, we want to be more demanding on price improvement. 
    let adjustment = quotePriceAdjustment(deviation); 
    prcCeiling += adjustment; 
    
    // Testing a strategy to:
    // a) encourage a short position when price pops up. 
    // b) avoid buying at very high prices, when for example there is a short lived liquidity hole.
    // Enforce bid to be at least one tick away from the current best bid. 
    if((bestBids[0].price) > target.hiPrice) { 
        prcCeiling = Math.min(bestBids[0].price - tickSize,prcCeiling);
    }
    console.log({ 
        taperPrice : taperPrice,
        adjustment : adjustment,
        prcCeiling : prcCeiling,
        prcFloor   : prcFloor
    });

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

        // Reduce quota for quote levels that are away from best. 
        let quota = Math.max(0,quoteQuota(bid.qty)-i);
        if(i==0 && deviation < -0.33) quota++; // Add to quota if we are in a short position.  

        let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
 
        let freshOrders = hasFreshOrders(orders);
        //if (orders.length>0) { 
        //    const xxMinutes = orders.length*3.0; // Minimum number of minutes bewteen orders at a given price level.
        //    const xxMilliSeconds = xxMinutes * 60 * 1000; 
        //    freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMilliSeconds);
        //}
        
        let quotaFull = orders.length >= quota
        //let quotaFull = (bid.qty < qtyQuanta[orders.length]);
        let quotaBreach = orders.length > quota;
        //let quotaBreach = orders.length > 0 ? (bid.qty < qtyQuanta[orders.length-1]) : false;
        
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach @ ${bid.price} (${bid.qty})and cancelling last order.`);
        }

        if (bid.price > prcCeiling || bid.price < prcFloor) 
            continue; 

        console.log(
            `${orders.length} orders @ ${bid.price} (${bid.qty}) quota: ${quota} orders freshOrders: ${freshOrders}`
        );

        if(bid.price > prcCeiling || bid.price < prcFloor || quotaFull || freshOrders) {
           // console.log(`> Ignore price level ${bid.price} `);
           // console.log(`>> quotaFull: ${quotaFull}`); 
           // console.log(`>> freshOrders: ${freshOrders}`);
        } else {
            console.log(`> Place BUY at ${bid.price}`);
            try {
                joinBid = await placeOrder(
                    'BUY', 
                    qty, 
                    symbol, 
                    bid.price
                );
                console.log(`Placed: ${joinBid.side} ${joinBid.origQty} @ ${joinBid.price}`);   
                break;  // Throttle to only one order at a time.   
            } catch (error) {
                console.error(error.message);
            }
        }
    };
}

async function makeOffers(bestOffers, allOrders, position, params) {

    console.log(`Making offers for ${symbol} at ${new Date()}`);

    // let usdcTotal = params.coinQty;
    let deviation = params.deviation;
   
    //let prcFloor = position.mAvgBuyPrice; // Avoid selling back at a loss relative to our recent trades.   
    let prcCeiling = bestOffers[2].price;
    
    //taperBuyPrice = params.avgBuy.taperPrice;
    //taperSellPrice = params.avgSell.taperPrice; 

    let taperPrice = params.avgSell.taperPrice;
   
    /* See comments in makeBids.
    if ( deviation > 0.5 ) { //(usdcTotal < targetQ) {
        // We are long so want to sell even if at cost or at a loss.
        //prcFloor = Math.max(position.mAvgBuyPrice,bestOffers[0].price);
        taperPrice = taperBuyPrice;
        console.log(`Overbought at ${usdcTotal} at an recent avg price of ${position.mAvgBuyPrice} (${position.mAvgBuyAge} hrs)`);
    } 
    */

    // Adjust price floor to allow for position deviation. 
    let prcFloor = Math.max(taperPrice,params.mktPrice);
    let adjustment = quotePriceAdjustment(deviation); 
    prcFloor += adjustment; 
    
    // Testing a strategy to 
    // a) encourage a long position when price drops. 
    // b) avoid selling at very low prices, when for example there is a short lived liquidity hole.
    // Default bid is one tick away from the current best bid. 
    if((bestOffers[0].price) < target.loPrice) { 
        prcFloor = Math.max(bestOffers[0].price + tickSize, prcFloor);
    }

    console.log({ 
        taperPrice : taperPrice, 
        adjustment : adjustment,
        prcCeiling : prcCeiling,
        prcFloor : prcFloor
    });
    
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

        // Reduce quote for quote levels that are away from best. 
        let quota = Math.max(0,quoteQuota(offer.qty)-i);
        if(i==0 && deviation > 0.33) quota++; // Add to quota if we are in a long position.  

        let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
        
        let freshOrders = hasFreshOrders(orders);
        //let freshOrders = false;
        //if (orders.length>0) { 
        //    const xxMinutes = orders.length*3; // Minimum number of minutes bewteen orders at a give price level.
        //    const xxMilliSeconds = xxMinutes * 60 * 1000; // Ten minutes in milliseconds
        //    freshOrders = ((Date.now() - orders[orders.length-1].time) < xxMilliSeconds);
        //}

        let quotaFull = orders.length >= quota;
        //let quotaFull = (offer.qty < qtyQuanta[orders.length]);
        let quotaBreach = orders.length > quota;
        //let quotaBreach = orders.length > 0 ? (offer.qty < qtyQuanta[orders.length-1]) : false;
           
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach @ ${offer.price} (${offer.qty}) and cancelling last order.`);
        }
        
        if (offer.price > prcCeiling || offer.price < prcFloor) 
            continue; 
        
        console.log(`${orders.length} orders @ ${offer.price} (${offer.qty}) quota: ${quota} orders freshOrders: ${freshOrders}`);      
            
        if(offer.price < prcFloor || offer.price > prcCeiling || quotaFull || freshOrders) {
       //     console.log(`> Ignore price level ${offer.price}`);
       //     console.log(`>> quotaFull: ${quotaFull}, breach: ${quotaBreach}`); 
       //     console.log(`>> freshOrders: ${freshOrders}`);
        } else {
            console.log(`> Place SELL @ ${offer.price}`);
            try {
                joinOffer = await placeOrder(
                    'SELL', 
                    qty, 
                    symbol, 
                    offer.price
                );
                console.log(`Placed: ${joinOffer.side} ${joinOffer.origQty} @ ${joinOffer.price}`); 
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
        console.log("Fetching price depth, account info, open orders and trading position.");

        const prcDepth = await fetchPriceDepth(symbol);
        const noneZeroBalances =  await fetchAccountInfo();
        const allOrders = await fetchOpenOrders(symbol);
        const position = await fetchPositions(symbol, 1);
        const priceStats  = await fetchPriceStats(symbol, '15m');

        let balances = {
            usdc : noneZeroBalances.balances.filter(balance => (balance.asset=='USDC'))[0],
            usdt : noneZeroBalances.balances.filter(balance => (balance.asset=='USDT'))[0]
        }    
      
        //let mktMidPrice = 0.5*(prcDepth.bids[0].price + prcDepth.asks[0].price);
        let mktPrice = priceStats.weightedAvgPrice;
        let targetQ = targetQty(mktPrice);
        let coinQty = balances.usdc.total;
        let deviation = (coinQty - targetQ)/posLimit;

        let taperSellPrice = taperTradePrice(  
            position.mAvgSellPrice,
            position.mAvgSellAge,
            mktPrice);
            
        let taperBuyPrice = taperTradePrice( 
            position.mAvgBuyPrice,
            position.mAvgBuyAge,
            mktPrice);

        let params = {
            mktPrice: mktPrice,
            coinQty: coinQty, 
            targetQty : targetQty(mktPrice),
            deviation : deviation,
            avgBuy : { 
                price : position.mAvgBuyPrice,
                qty : position.mAvgBuyQty, 
                age : position.mAvgBuyAge,
                taperPrice : taperBuyPrice
            },
            avgSell : { 
                price : position.mAvgSellPrice,
                qty : position.mAvgSellQty,
                age : position.mAvgSellAge, 
                taperPrice : taperSellPrice
            }
        };
        console.log(params); 

        makeBids(
            prcDepth.bids, 
            allOrders.filter(order => (order.side==='BUY')), 
            position, 
            params
        );

        makeOffers(
            prcDepth.asks, 
            allOrders.filter(order => (order.side==='SELL')), 
            position,
            params
        ); 

    } catch (error) {
        console.error(error.message);
    }
}

if (require.main === module) placeSCoinOrders();
