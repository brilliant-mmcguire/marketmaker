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
    119,238,319	8 
    27,183      0 (1)
    73,891      0 (2)
    200,855	    3
    545,982	    4
    1,484,132	5
    4,034,288	6
    10,966,332	7
    29,809,580	8
    81,030,839	9*/
    
    const scaleQuoteSize = 10000; 
    const normalisedQuoteSize = mktQuoteSize / scaleQuoteSize; 
    
    const logQuoteSize =
        normalisedQuoteSize >= 1 ?  Math.log(normalisedQuoteSize) : 0;

    logQuoteSize*=1.3; // Scale up number of orders.  

    if (mktQuoteSize < 200000) return 0; // avoid placing orders into small quote sizes.
    return Math.round(logQuoteSize - 0.5); /*round up*/
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
        const xxMilliSeconds = randomisedInterval(orderCount); 
        freshOrders = ((Date.now() - lastOrderTime) < xxMilliSeconds);
    }
    return freshOrders;
}

function randomisedInterval(activeOrderCount) {
    const xxMinutes = 7; // Max number of minutes between orders, with one active order.
    const xxMilliSeconds = xxMinutes * 60 * 1000; // xx minutes expressed in milliseconds.
    let rnd = Math.ceil(
        Math.random() * xxMilliSeconds * Math.max(1,activeOrderCount)
        );
    //console.log(`Randomised Order Interval ${(rnd/60/1000).toFixed(2)} minutes`);
    return rnd;
}

// Want to place an order ever xx Minutes on average.  
// Rather than place an order after at set intervals we use a random number 
//  to space out order placement with an average interval of xx minutes.
// Assume a polling period of 1 minute. 
/* active orders count v random variable bar 
    0	0.33
    1	0.17
    2	0.11
    3	0.08
    4	0.07
    5	0.06
    6	0.05
    7	0.04 */ 
function stochasticDecision(orderCount) { 
    const x = Math.random();
    const bar = 1.0/(3.0*(1+orderCount)); 
    const decision = x <= bar

    console.log(`> Stochastic decision: ${decision} (x: ${x.toFixed(4)} bar: ${bar.toFixed(4)})`)
    return decision;
}

async function makeBids(mktQuotes, allOrders, position, params) {
    console.log(`Making bids for ${symbol} at ${new Date()}`);

   // let usdcTotal = params.coinQty;
    let deviation = params.deviation;
    let prcFloor = mktQuotes[2].price;
    let taperPrice = params.avgBuy.taperPrice;

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
    if((mktQuotes[0].price) > target.hiPrice) { 
        prcCeiling = Math.min(mktQuotes[0].price - tickSize,prcCeiling);
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
    
    for(let i = 0; i< mktQuotes.length; i++) {
        let bid = mktQuotes[i];
        let qty = qtyLadder[i];

        // Reduce quota for quote levels that are away from best. 
        let quota = Math.max(0,quoteQuota(bid.qty)-i);
        if(i==0 && deviation < -0.33) quota++; // Add to quota if we are in a short position.  

        let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
 
        let freshOrders = hasFreshOrders(orders);
        let quotaFull = orders.length >= quota
        let quotaBreach = orders.length > quota;
        
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach @ ${bid.price} (${bid.qty})and cancelling last order.`);
        }

        if (bid.price > prcCeiling || bid.price < prcFloor) continue; 

        console.log(
            `${orders.length} orders @ ${bid.price} (${bid.qty}) quota: ${quota} orders freshOrders: ${freshOrders}`
        );

        if(quotaFull) continue; 
        
        if( ! stochasticDecision(orders.length)) continue;
    
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
    };
}

async function makeOffers(mktQuotes, allOrders, position, params) {

    console.log(`Making offers for ${symbol} at ${new Date()}`);

    let deviation = params.deviation;
    let prcCeiling = mktQuotes[2].price;
    let taperPrice = params.avgSell.taperPrice;
   
    // Adjust price floor to allow for position deviation. 
    let prcFloor = Math.max(taperPrice,params.mktPrice);
    let adjustment = quotePriceAdjustment(deviation); 
    prcFloor += adjustment; 
    
    // Testing a strategy to 
    // a) encourage a long position when price drops. 
    // b) avoid selling at very low prices, when for example there is a short lived liquidity hole.
    // Default bid is one tick away from the current best bid. 
    if((mktQuotes[0].price) < target.loPrice) { 
        prcFloor = Math.max(mktQuotes[0].price + tickSize, prcFloor);
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
    
    for(let i = 0; i< mktQuotes.length; i++) {
        let offer = mktQuotes[i];
        let qty = qtyLadder[i];

        // Reduce quote for quote levels that are away from best. 
        let quota = Math.max(0,quoteQuota(offer.qty)-i);
        if(i==0 && deviation > 0.33) quota++; // Add to quota if we are in a long position.  

        let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
        
        let freshOrders = hasFreshOrders(orders);
        let quotaFull = orders.length >= quota;
        let quotaBreach = orders.length > quota;
           
        if(quotaBreach) {
            cancelOrders([orders[orders.length-1]]);
            console.log(`Quota breach @ ${offer.price} (${offer.qty}) and cancelling last order.`);
        }
        
        if (offer.price > prcCeiling || offer.price < prcFloor) continue; 

        console.log(
            `${orders.length} orders @ ${offer.price} (${offer.qty}) quota: ${quota} orders freshOrders: ${freshOrders}`
        );      
            
        if(quotaFull) continue;
        if( ! stochasticDecision(orders.length)) continue;
        
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
