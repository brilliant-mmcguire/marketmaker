/*
Implement a sweep of a trading strategy. 
Cancel all open orders and then place new orders in a small grid around the current spot price. 
Orders are priced so that they are within the expected hourly highs and lows.

Problem to solve: In steady, strong moves up (or down) are over selling asset and running out.  
Need to be more demanding on price to reduce over selling / buying. 
*/
const { placeOrder } = require('./orderTxns');
const { fetchPositions } = require('./fetchTrades');
const { fetchPriceStats } = require('./marketDataTxns');
const { cancelOpenOrders } = require('./orderTxns');
const { fetchAccountInfo } = require('./accountTxns');

const threshold = { 
    orderCount : 2,

    overSold : 200.0, 
    short : 300.0, 
    long : 400.0,
    overBought : 500.0,

    overSoldPct : 1.032,  
    shortPct : 1.0022,  
    longPct : 1.0018, 
    overBoughtPct : 0.972
};

function getOrderParameters(priceStats) {

    // Base prices: midway between current price (close) and the high or low. 
    const sellBasePrc = 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = 0.5*(priceStats.lastPrice + priceStats.lowPrice);
   
    return {
        quantity : (Math.round((17.0 / priceStats.weightedAvgPrice) * 10000)) / 10000,
        sell : [
            Math.round((sellBasePrc * 1.0210) * 100) / 100,
            Math.round((sellBasePrc * 1.0160) * 100) / 100,
            Math.round((sellBasePrc * 1.0110) * 100) / 100,
            Math.round((sellBasePrc * 1.0070) * 100) / 100,
            Math.round((sellBasePrc * 1.0050) * 100) / 100,
            Math.round((sellBasePrc * 1.0030) * 100) / 100,
            Math.round((sellBasePrc * 1.0010) * 100) / 100
        ],
        buy : [
            Math.round((buyBasePrice * 0.9790) * 100) / 100,
            Math.round((buyBasePrice * 0.9840) * 100) / 100,
            Math.round((buyBasePrice * 0.9890) * 100) / 100,
            Math.round((buyBasePrice * 0.9930) * 100) / 100,
            Math.round((buyBasePrice * 0.9950) * 100) / 100, 
            Math.round((buyBasePrice * 0.9970) * 100) / 100, 
            Math.round((buyBasePrice * 0.9990) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, position, balance, priceStats) {
    const params = getOrderParameters(priceStats);

    assetTotal = balance.total * priceStats.weightedAvgPrice;  

    console.log(assetTotal); 

    const dt = new Date();
    console.log(`${symbol} current price ${priceStats.lastPrice} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    
    console.log(`Place orders at:`, params);
   
    try {  // Make bids.
        let orderCount=0; 
        for (let i = params.buy.length-1; i > 0; i--) {
           
            if((assetTotal > threshold.overBought) && params.buy[i] >  (threshold.overBoughtPct * position.mAvgBuyPrice)) {
                console.log(
                    `overbought so avoid buying unless we are improving our avg cost price by a lot.`, 
                    params.buy[i]); 
                continue;   
            }
            else if((assetTotal > threshold.long) && params.buy[i] >  (threshold.longPct * position.mAvgBuyPrice)) {
                console.log(
                    `long position so we don't want to buy unless we are improving our avg cost price.`, 
                    params.buy[i]);
                continue;
            }

            if(assetTotal < threshold.overSold && params.buy[i] < threshold.overSoldPct * position.mAvgSellPrice) {
                console.log(
                    `oversold so buy back at ${params.buy[i]} to realise a loss.`);
                //continue;
            } else if((position.cost < threshold.short) && params.buy[i] > (threshold.shortPct * position.mAvgSellPrice)) {
                console.log(
                    `short position and we do not want to buy at ${params.buy[i]}, which is more than cost price.`);
                continue;
            }
            const buyOrder = await placeOrder(
                'BUY', 
                params.quantity, 
                symbol, 
                params.buy[i]
            );
            console.log('Placed Buy Order:', buyOrder);
            if(++orderCount >= threshold.orderCount) break;
        }
    } catch (error) {
        console.log(`Error thrown placing buy order ${error}`);
    }

    try { // Make offers.
        let orderCount=0; 
        for (let i = params.sell.length-1; i > 0;  i--) {
            if(assetTotal < threshold.overSold && params.sell[i] <  (threshold.overSoldPct * position.mAvgSellPrice)) {
                console.log(
                    `Oversold so we don't want to sell unless we are improving our avg price a lot.` , 
                    params.sell[i]);
                continue;
            } else
            if(assetTotal< threshold.short && params.sell[i] <  (threshold.shortPct * position.mAvgSellPrice)) {
                console.log(
                    `short position so we don't want to sell unless we are improving our avg cost price.` , 
                    params.sell[i]);
                continue;
            }

            if(assetTotal > threshold.overBought && params.sell[i] > threshold.overBoughtPct * position.mAvgBuyPrice) {
                console.log(
                    `Overbought so we may may need to sell back at a loss.`, 
                    params.sell[i]);
               // continue;
            } else
            if(assetTotal > threshold.long && params.sell[i] < threshold.longPct*position.mAvgBuyPrice) {
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
            console.log('Placed Sell Order:', sellOrder);
            
            if(++orderCount>=threshold.orderCount) break;
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
    const priceStats  = await fetchPriceStats(symbol, '1h');
    const noneZeroBalances =  await fetchAccountInfo();

    let balance = {};
    if(symbol.startsWith("BTC")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='BTC'))[0];

    if(symbol.startsWith("ETH")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='ETH'))[0];

    if(symbol.startsWith("XRP")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='XRP'))[0];

    await placeNewOrders(symbol, position, balance, priceStats); 
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