/*
Implement a sweep of a trading strategy. 
Cancel all open orders and then place new orders 
in a small grid around the current spot price. 
Orders are priced so that they are within the expected hourly highs and lows.
*/
const { placeOrder } = require('./orderTxns');
const { fetchPositions } = require('./fetchTrades');
const { fetchPriceStats } = require('./marketDataTxns');
const { cancelOpenOrders } = require('./orderTxns');

const threshold = { 
    orderCount : 2,
    overSold : -250.0, 
    short : -100.0, 
    long : 100.0,
    overBought : 250.0 
};

function getOrderParameters(priceStats) {

    // Base prices: midway between current price (close) and the high or low. 
    const sellBasePrc = 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = 0.5*(priceStats.lastPrice + priceStats.lowPrice);

    return {
        quantity : (Math.round((17.0 / priceStats.weightedAvgPrice) * 10000)) / 10000,
        sell : [
            //Math.round((sellBasePrc * 1.0210) * 100) / 100,
            //Math.round((sellBasePrc * 1.0160) * 100) / 100,
            //Math.round((sellBasePrc * 1.0110) * 100) / 100,
            //Math.round((sellBasePrc * 1.0070) * 100) / 100,
            //Math.round((sellBasePrc * 1.0040) * 100) / 100,
            Math.round((sellBasePrc * 1.0030) * 100) / 100,
            Math.round((sellBasePrc * 1.0010) * 100) / 100
        ],
        buy : [
            //Math.round((buyBasePrice * 0.9790) * 100) / 100,
            //Math.round((buyBasePrice * 0.9840) * 100) / 100,
            //Math.round((buyBasePrice * 0.9890) * 100) / 100,
            //Math.round((buyBasePrice * 0.9930) * 100) / 100,
            //Math.round((buyBasePrice * 0.9960) * 100) / 100, 
            Math.round((buyBasePrice * 0.9970) * 100) / 100, 
            Math.round((buyBasePrice * 0.9990) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, position) {
    const priceStats  = await fetchPriceStats(symbol, '1h');
    const params = getOrderParameters(priceStats);

    const dt = new Date();
    console.log(`${symbol} current price ${priceStats.lastPrice} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    console.log(`Place orders at:`, params);
   
    try {  // Make bids.
        let orderCount=0; 
        for (let i = 0; i < params.buy.length; i++) {
            if((position.cost > threshold.overBought) && params.buy[i] >  (0.990 * position.avgPrice)) {
                console.log(
                    `overbought so avoid buying unless we are improving our avg price lot.`, 
                    params.buy[i]);
                continue; 
            }
            else if((position.cost > threshold.long) && params.buy[i] >  (0.999 * position.avgPrice)) {
                console.log(
                    `long position so we don't want to buy unless we are improving our avg price.`, 
                    params.buy[i]);
                continue;
            }

            if(position.cost < threshold.overSold && params.buy[i] < 1.025 * position.avgPrice) {
                console.log(
                    `oversold so may need to buy back at a loss.`, 
                    params.buy[i]);
                // continue;
            } else if((position.cost < threshold.short) && params.buy[i] > (0.999 * position.avgPrice)) {
                console.log(
                    `short position and we do not want to buy at more than cost price.`, 
                    params.buy[i]);
                continue;
            }

            const buyOrder = await placeOrder(
                'BUY', 
                params.quantity, 
                symbol, 
                params.buy[i]
            );
            console.log('Order placed:', buyOrder);
            if(orderCount++>=threshold.orderCount) break;
        }
    } catch (error) {
        console.log(`Error thrown placing buy order ${error}`);
    }

    try { // Make offers.
        let orderCount=0; 
        for (let i = 0; i < params.sell.length; i++) {

            if(position.cost < threshold.overSold && params.sell[i] <  (1.010 * position.avgPrice)) {
                console.log(
                    `Oversold so we don't want to sell unless we are improving our avg price a lot.` , 
                    params.sell[i]);
                continue;
            } else
            if(position.cost < threshold.short && params.sell[i] <  (1.001 * position.avgPrice)) {
                console.log(
                    `short position so we don't want to sell unless we are improving our avg price.` , 
                    params.sell[i]);
                continue;
            }

            if(position.cost > threshold.overBought && params.sell[i] > 0.99*position.avgPrice) {
                console.log(
                    `Overbought so we may may need to sell back at a loss.`, 
                    params.sell[i]);
               // continue;
            } else
            if(position.cost > threshold.long && params.sell[i] < 1.001*position.avgPrice) {
                console.log(
                    `long position and we do not want to sell at less than cost price.`, 
                    params.sell[i]);
                continue;
            }

            const sellOrder = await placeOrder(
                'SELL', 
                params.quantity, 
                symbol, 
                params.sell[i]
            );
            console.log('Order placed:', sellOrder);
            if(orderCount++>=threshold.orderCount) break;
        }
    } catch (error) {
        console.log(`Error thrown placing sell order ${error}`);
    }
    return;
}

exports.replaceOrders = replaceOrders;
async function replaceOrders(symbol) 
{
    await cancelOpenOrders(symbol);
    const position = await fetchPositions(symbol, 3);
    await placeNewOrders(symbol, position); 
}

async function main() {
    const symbol = process.argv[2];
    if(!symbol) throw 'Symbol not provided.'; 
    try {
        await replaceOrders(symbol);
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}
if (require.main === module) main();