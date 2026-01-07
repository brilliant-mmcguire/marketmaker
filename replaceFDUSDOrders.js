/*
Refresh orders for FDUSD trading pairs.
*/

const { fetchOpenOrders } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchPriceDepth } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');
const { cancelOrders } = require('./orderTxns');
const { fetchAccountInfo } = require('./accountTxns');
const { fetchPriceStats } = require('./marketDataTxns');

const symbol = 'FDUSDUSDT';

/*
Use a quantity maximum and scale back as we run low on coinage.  
This is to reduce the impact of sharp price moves where the price shoots through and 
remains at high/low levels for some period of time.  In this scenario we become 
oversold/overbought too quickly. 
*/
const qtyMax =  129;
const qtyMin =  11;

const tickSize = 0.0001;  // Tick Size is 1 basis point.
const posLimit = 200  // aim to remain inside targetQ +- posLimit

const target = {
    hiPrice : 0.99992,  //
    loPrice : 0.99725,  // 
    hiQty   : 100, // Hold less SCoin when its price is high in anticipation of mean reversion.  
    loQty   : 1000, // Buy more SCoin when its price is low. 
};


/*
Target USDC balance uses a sigmoid function between the upper and lower target quantities.
At the upper target we can tolerate a smaller position in the expectation of prices falling again. 
At the lower target we allow for a larger position, expecting a price increase in the near future.  
*/
function targetQty(mktPrice, meanRevPrc) {
    /*  Price	Target - fudge factor of 0.25 
        1.0015	1,046
        1.0010	1,152
        1.0005	1,445
        1.0003	1,642
        1.0001	1,876
        1.0000	2,000
        0.9999	2,124
        0.9997	2,358
        0.9995	2,555
        0.9990	2,848
        0.9985	2,954 */
/*  Price	Target - fudge factor of 0.5
        1.0015	1000
        1.0010	1003
        1.0005	1036
        1.0003	1095
        1.0001	1238
        1.0000	1365
        0.9999	1538
        0.9997	2000
        0.9995	2462
        0.9990	2941
        0.9985	2995 */ 
    const prcDeviation = 0.5*(mktPrice-meanRevPrc)/tickSize; 
    const qZero =  target.loQty;
    const qMax = target.hiQty - target.loQty;
    const qty = qZero + qMax*sigmoid(prcDeviation);
    return qty;
}

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
       -10	0.0000 */
    return 1 / (1 + Math.exp(-x));
}

function quoteQuota(mktQuoteSize) {
    /* SCALE FACTOR  1.  2.  3. 
           100,000   0.  0.  0. 
           271,828	 1.  2.  3.
           738,906   2.  4.  6. 
          2,008,554  3.  6.  9. 
          5,459,815  4.  8. 12. 
         14,841,316  5. 10. 15. 
         40,342,879  6. 12. 18. 
        109,663,316  7. 14. 21. 
    */
    //if (mktQuoteSize < 50000) return 0; // avoid placing orders into small quote sizes.
    const zeroOrderQuoteSize = 100000; 
    const scaleUpFactor = 2;  
    const normalisedQuoteSize = mktQuoteSize / zeroOrderQuoteSize; 
    let logQuoteSize = scaleUpFactor * (
        normalisedQuoteSize >= 1 ?  Math.log(normalisedQuoteSize) : 0
    );
    return logQuoteSize;
    //return Math.round(logQuoteSize - 0.5); /*round up*/
}

function taperTradePrice(tradePrice, tradeAge, mktPrice) {
    // Weight our avg trade price with the market price depending on the age of our trades. 
    // If we have'd traded for a while (up to lifeTime hours), 
    // we tend to the recent market price.
    const lifeTime = 8.0; // hours.
    //const ageScalar = Math.sqrt(Math.max(6.0 - tradeAge,0)/lifeTime); 
    //const ageScalar = Math.sqrt(Math.max(lifeTime - tradeAge,0)/lifeTime);
    const ageScalar = Math.max(lifeTime - tradeAge,0)/lifeTime; 
    console.assert(ageScalar<=1.0 && ageScalar >=0.0 ,`0 <= trade age scalar <= 1`);
    return ageScalar*tradePrice + (1.0-ageScalar)*mktPrice;
}

function quotePriceAdjustment(normalisedDeviation) { 
    /*  DEV  ADJUSTMENT  
        +1.5  -6.75
        +1.0  -2.00 
        +0.5  -0.25
        +0.0  +0.00
        -0.5  +0.25
        -1.0  +2.00
-       -1.5  +6.75 */
    return -2.0 * tickSize * normalisedDeviation**3;
}

function scaleOrderQty(balances) {
    const totalUSD = balances.fdusd.total+balances.usdt.total;
    const freeUSD = 2.0 * Math.min(balances.fdusd.free, balances.usdt.free);
    const scaleFactor = Math.sqrt(freeUSD / totalUSD);
    //const scaleFactor = freeUSD / totalUSD;
    console.assert(scaleFactor >= 0 && scaleFactor <= 1, "Order qty scale factor must be between 0 and 1" ); 
    const qty = Math.max(qtyMin,qtyMax * scaleFactor);
    return Math.round(qty); 
}

/*
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
    return rnd;
}
*/

// Want to place an order every xx Minutes on average.  
// Rather than place an order at set intervals we use a random number 
// to space out order placement with an average interval of xx minutes.
// Assume a polling period of 1 minute. 
/* random variable bar when timeFactor is 2.0 
	Go	    Don't go	Expected interval
0	0.50	0.50	    2
1	0.25	0.75	    4
2	0.17	0.83	    6
3	0.13	0.88	    8
4	0.10	0.90	    10
5	0.08	0.92	    12
6	0.07	0.93	    14
7	0.06	0.94	    16
8	0.06	0.94	    18
*/ 
function stochasticDecision(orderCount) { 
    const x = Math.random();
    const timeScaleFactor = 2.0; 
    const bar = 1.0/(timeScaleFactor*(1+Math.pow(orderCount,1.5))); 
    const decision = x <= bar;

    console.log(`> Stochastic decision: ${decision} (x: ${x.toFixed(4)} bar: ${bar.toFixed(4)})`)
    return decision;
}

/**
 * Calculate the price ceiling for bids.
 * @param {Array} mktQuotes - The market bid quotes.
 * @param {Object} params - The trading parameters.
 * @param {Object} target - The target config object.
 * @param {number} tickSize - The tick size.
 * @returns {number} The calculated price ceiling.
 */
function calculateBidCeiling(mktQuotes, params, target, tickSize) {
    let taperPrice = params.avgBuy.taperPrice;
    let bidCeiling = Math.min(taperPrice, params.mktPrice);
    let adjustment = Math.min(quotePriceAdjustment(params.deviation),0);
    bidCeiling += adjustment;
  
    // If market price is above our high target, be more conservative.
    // Testing a strategy to     
    // a) encourage a short position when price pops up. 
    // b) avoid buying at very high prices, when for example there is a short lived liquidity hole.
    // Enforce bid to be at least one tick away from the current best bid. 
  //  if((mktQuotes[0].price) > target.hiPrice) { 
        bidCeiling = Math.min(target.hiPrice, bidCeiling);
  //  }
    console.log({ 
        taperPrice : taperPrice,
        adjustment : adjustment,
        bidCeiling : bidCeiling
    });

    return bidCeiling;
}

/**
 * Calculate the price floor for offers.
 * @param {Array} mktQuotes - The market ask quotes.
 * @param {Object} params - The trading parameters.
 * @param {Object} target - The target config object.
 * @param {number} tickSize - The tick size.
 * @returns {number} The calculated price floor.
 */
function calculateOfferFloor(mktQuotes, params, target, tickSize) {
    let taperPrice = params.avgSell.taperPrice;
    let offerFloor = Math.max(taperPrice, params.mktPrice);
    let adjustment = Math.max(quotePriceAdjustment(params.deviation),0);
    offerFloor += adjustment;
    
    // If market price is below our low target, be more conservative
    // Testing a strategy to 
    // a) encourage a long position when price drops. 
    // b) avoid selling at very low prices, when for example there is a short lived liquidity hole.
  //  if((mktQuotes[0].price) < target.loPrice) { 
        offerFloor = Math.max(target.loPrice, offerFloor);
  //  }
    console.log({ 
        taperPrice : taperPrice, 
        adjustment : adjustment,
        offerFloor : offerFloor
    });

    return offerFloor;
}

function calculateParams(balances, position, priceStats) {
    const mktPrice = priceStats.weightedAvgPrice;
    const meanRevPrc = 0.5*(target.hiPrice+target.loPrice)
    const targetQ = targetQty(mktPrice, meanRevPrc);
    const coinQty = balances.fdusd.total;
    const deviation = (coinQty - targetQ) / posLimit;
     
    const taperSellPrice = taperTradePrice(
        position.mAvgSellPrice - 0.5*tickSize,
        position.mAvgSellAge,
        mktPrice);
    const taperBuyPrice = taperTradePrice(
        position.mAvgBuyPrice + 0.5*tickSize,
        position.mAvgBuyAge,
        mktPrice);

    return {
        mktPrice,
        meanRevPrc,
        coinQty,
        targetQty: targetQ,
        deviation,
        orderQty: scaleOrderQty(balances),
        avgBuy: {
            price: position.mAvgBuyPrice,
            qty: position.mAvgBuyQty,
            age: position.mAvgBuyAge,
            taperPrice: taperBuyPrice
        },
        avgSell: {
            price: position.mAvgSellPrice,
            qty: position.mAvgSellQty,
            age: position.mAvgSellAge,
            taperPrice: taperSellPrice
        }
    };
}

async function fetchApiData(symbol) {
    const [prcDepth, nonZeroBalances, allOrders, position, priceStats] = await Promise.all([
        fetchPriceDepth(symbol),
        fetchAccountInfo(),
        fetchOpenOrders(symbol),
        fetchPositions(symbol, 5),
        fetchPriceStats(symbol, '15m')
    ]);
    return { prcDepth, nonZeroBalances, allOrders, position, priceStats };
}

// Parse command line arguments for read-only mode
const args = process.argv.slice(2);
const readOnly = args.includes('--read-only');

/**
 * Calculates the total sum of 'origQty' from an array of order objects.
 *
 * @param {Array<Object>} orderArray - The array of order objects.
 * @returns {number} The calculated total quantity.
 */
function calculateTotalQuantity(orderArray) {
    // Use the reduce method to iterate over the array and accumulate the sum.
    // The initial value for the accumulator (total) is 0.
    return orderArray.reduce((total, order) => {
        // Convert the string value of origQty to a floating-point number
        // and add it to the running total.
        const quantity = parseFloat(order.origQty);

        // Add the quantity to the total, ensuring we handle potential NaN if
        // parsing fails (though it shouldn't with the given input format).
        if (!isNaN(quantity)) {
            return total + quantity;
        }

        return total; // Return the total unchanged if parsing fails
    }, 0);
}

async function makeBids(mktQuotes, allOrders, params, readOnly) {
    console.log(`Making bids for ${symbol} at ${new Date()}`);

    let prcFloor = mktQuotes[mktQuotes.length-1].price;
    let bidCeiling = calculateBidCeiling(mktQuotes, params, target, tickSize);

    //cancel any open orders exceeding the price ceiling and fallen under the price floor. 
    let staleOrders = allOrders.filter(order => (
        parseFloat(order.price)<prcFloor
        ));
    
    if(staleOrders.length>0) {
         if (readOnly) {
             console.log(`[READ ONLY] Would cancel orders above price ceiling`);
         } else {
             console.log(`Cancel orders above price ceiling`);
             await cancelOrders(staleOrders);
         }
    }
    
    for(let i = 0; i< mktQuotes.length; i++) {
        let bid = mktQuotes[i];
        let qty = params.orderQty; // scaled order quantity;
        let quota = quoteQuota(bid.qty); 
        
        if (bid.price > bidCeiling) {
            quota = 0;
        } else if(bid.price >= (bidCeiling - tickSize) ) {
            quota *= (1.0 - ((bid.price - (bidCeiling - tickSize))/tickSize));
        } else { //bid.price <  (bidCeiling - tickSize)
            quota *= (1.0 - ((bidCeiling - tickSize) - bid.price)/(2.0*tickSize));
        }

        
        /*
        if(i==0 && params.deviation < -0.50) quota++; // Add to quota if we are in a short position.  
        if(i==0 && params.deviation < -0.66) quota++; // Add to quota if we are in a short position.  
        if(i==0 && params.deviation < -1.00) quota++; // Add to quota if we are in a short position.  
        if(i==0 && params.deviation < -1.33) quota++; // Add to quota if we are in a short position.  
        */
        if(i==0 && params.deviation > 0) quota *= (1.0 - 0.5*Math.abs(params.deviation)); 
        /*
        if(i==0 && params.deviation > 0.33) quota--; // Reduce quota when already long.  
        if(i==0 && params.deviation > 0.66) quota--; // Reduce quota when already long.  
        if(i==0 && params.deviation > 1.00) quota--; // Reduce quota when already long.  
        if(i==0 && params.deviation > 1.33) quota--; // Reduce quota when already long.  
        */ 

        quota = Math.max(0,Math.floor(quota));

        let orders = allOrders.filter(order => parseFloat(order.price) === bid.price )
                        
        //let freshOrders = hasFreshOrders(orders);
        let quotaFull = orders.length >= quota;
        let quotaBreach = orders.length > quota;
        let activeQty = calculateTotalQuantity(orders);
        
        console.log(
            /* q:${bid.qty} -> */
            `[${i}] ${orders.length} orders @ ${bid.price} (quota: ${quota} orders) qty: ${activeQty}`
        );

        if(quotaBreach) {
            const mostRecentOrders = orders
                                .sort((a, b) => b.time - a.time)  // newest order first.
                                .slice(0,orders.length - quota);
           // const mostRecentOrder = orders.reduce((latest, order) => 
           //     order.time > latest.time ? order : latest
           // ); 
            if (readOnly) {
                console.log(`[READ ONLY] Would cancel newest of ${orders.length} orders for quota breach @ ${bid.price}`);
                console.log(mostRecentOrders);
            } else {
                cancelOrders(mostRecentOrders);
                console.log(`Quota breach @ ${bid.price} (${bid.qty}) and cancelling last orders.`);
            }
        }
        
        if(quotaFull) continue; 
        if( ! stochasticDecision(orders.length)) continue;
    
        console.log(`> Place BUY at ${bid.price}`);

        if (readOnly) {
            console.log(`[READ ONLY] Would place BUY at ${bid.price}`);
            break;
        }

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

async function makeOffers(mktQuotes, allOrders, params, readOnly) {
    console.log(`Making offers for ${symbol} at ${new Date()}`);

    const prcCeiling = mktQuotes[mktQuotes.length-1].price;
    const offerFloor = calculateOfferFloor(mktQuotes, params, target, tickSize);

    //cancel any open orders exceeding the price ceiling or fallen under the price floor. 
    let staleOrders = allOrders.filter(order => (
        parseFloat(order.price)>prcCeiling
        ));

    if(staleOrders.length>0) {
         if (readOnly) {
             console.log(`[READ ONLY] Would cancel orders below price floor`);
         } else {
             console.log(`Cancel orders below price floor`);
             await cancelOrders(staleOrders);
         }
    }
    
    for(let i = 0; i< mktQuotes.length; i++) {
        let offer = mktQuotes[i];
        let qty = params.orderQty; 
        let quota = quoteQuota(offer.qty);
       
        if (offer.price < offerFloor) {
            quota = 0;
        } else if(offer.price <= (offerFloor + tickSize)) {
            quota *= (1.0 - (((offerFloor + tickSize) - offer.price)/tickSize));
        } else { // offer.price > (offerFloor + tickSize)
            quota *= (1.0 - ((offer.price - (offerFloor + tickSize))/(2.0*tickSize)));
        }

        /*
        if(i==0 && params.deviation > 0.50) quota++; // Add to quota if we are in a long position.  
        if(i==0 && params.deviation > 0.66) quota++; // Add to quota if we are in a long position. 
        if(i==0 && params.deviation > 1.00) quota++; // Add to quota if we are in a long position.   
        if(i==0 && params.deviation > 1.33) quota++; // Add to quota if we are in a long position.   
        */
        if(i==0 && params.deviation < 0) quota *= (1.0 - 0.5*Math.abs(params.deviation)); 
        /*
        if(i==0 && params.deviation < -0.33) quota--; // Reduce quota when already short.  
        if(i==0 && params.deviation < -0.66) quota--; // Reduce quota when already short.  
        if(i==0 && params.deviation < -1.00) quota--; // Reduce quota when already short.  
        if(i==0 && params.deviation < -1.33) quota--; // Reduce quota when already short.  
        */
        quota = Math.max(0,Math.floor(quota));

        let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
        
        let quotaFull = orders.length >= quota;
        let quotaBreach = orders.length > quota;
        let activeQty = calculateTotalQuantity(orders);

        console.log(
            /* q:${offer.qty} -> */
            `[${i}] ${orders.length} orders @ ${offer.price} (quota: ${quota} orders) qty: ${activeQty}`
        );

        if(quotaBreach) {
            const mostRecentOrders = orders
                                .sort((a, b) => b.time - a.time)  // newest order first.
                                .slice(0,orders.length - quota);
            //const mostRecentOrder = orders.reduce((latest, order) =>
            //    order.time > latest.time ? order : latest
            //); 

            if (readOnly) {
                console.log(`[READ ONLY] Would cancel newest of ${orders.length} orders for quota breach @ ${offer.price}`);
                console.log(mostRecentOrders)
            } else {
                cancelOrders(mostRecentOrders);
                console.log(`Quota breach @ ${offer.price} (${offer.qty}) and cancelling last orders.`);
            }
        }
   
        if(quotaFull) continue;
        if( ! stochasticDecision(orders.length)) continue;
        
        console.log(`> Place SELL @ ${offer.price}`);

        if (readOnly) {
            console.log(`[READ ONLY] Would place SELL at ${offer.price}`);
            break;
        }

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

async function manageOrders(prcDepth, openOrders, params, readOnly) {
    await makeBids(
        prcDepth.bids, 
        openOrders.filter(order => order.side === 'BUY'), 
        params,
        readOnly
    );
    await makeOffers(
        prcDepth.asks, 
        openOrders.filter(order => order.side === 'SELL'), 
        params,
        readOnly
    );
}

exports.placeFDUSDOrders = placeFDUSDOrders;
async function placeFDUSDOrders() {
    try {        
        console.log("Fetching price depth, account info, open orders and trading position.");
        const { 
            prcDepth, nonZeroBalances, allOrders, position, priceStats 
        } = await fetchApiData(symbol);

        let balances = {
            fdusd : nonZeroBalances.balances.filter(balance => (balance.asset=='FDUSD'))[0],
             usdt : nonZeroBalances.balances.filter(balance => (balance.asset=='USDT'))[0]
        } 
        console.log(`Calculating parameters at ${new Date()}`)
        const params = calculateParams(balances,position,priceStats);
        console.log(params); 
       
        console.log(`Managing orders --read-only: ${readOnly}`)
        await manageOrders(prcDepth, allOrders, params, readOnly);
        
    } catch (error) {
        console.error(error.message);
    }
}

if (require.main === module) {
    (async () => {
        await placeFDUSDOrders();
    })();
}