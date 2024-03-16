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
    buyCount : 2,
    sellCount : 2,

    overSold : 200.0, 
    short : 280.0, 
    long : 360.0,
    overBought : 440.0,

    overSoldPct : 1.032,  
    shortPct : 1.0022,  
    longPct : 0.9977, 
    overBoughtPct : 0.967
};

function getOrderParameters(priceStats) {

    // Base prices: midway between current price (close) and the high or low. 
    const sellBasePrc = 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = 0.5*(priceStats.lastPrice + priceStats.lowPrice);
   
    return {
        quantity : (Math.round((17.0 / priceStats.weightedAvgPrice) * 10000)) / 10000,
        sell : [
            Math.round((sellBasePrc * 1.0360) * 100) / 100,
            Math.round((sellBasePrc * 1.0280) * 100) / 100,
            Math.round((sellBasePrc * 1.0210) * 100) / 100,
            Math.round((sellBasePrc * 1.0150) * 100) / 100,
            Math.round((sellBasePrc * 1.0100) * 100) / 100,
            Math.round((sellBasePrc * 1.0060) * 100) / 100,
            Math.round((sellBasePrc * 1.0030) * 100) / 100,
            Math.round((sellBasePrc * 1.0010) * 100) / 100
        ],
        buy : [
            Math.round((buyBasePrice * 0.9640) * 100) / 100,
            Math.round((buyBasePrice * 0.9720) * 100) / 100,
            Math.round((buyBasePrice * 0.9790) * 100) / 100,
            Math.round((buyBasePrice * 0.9850) * 100) / 100,
            Math.round((buyBasePrice * 0.9900) * 100) / 100,
            Math.round((buyBasePrice * 0.9940) * 100) / 100, 
            Math.round((buyBasePrice * 0.9970) * 100) / 100, 
            Math.round((buyBasePrice * 0.9990) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, position, balance, priceStats) {
    const params = getOrderParameters(priceStats);

    assetTotal = balance.total * priceStats.weightedAvgPrice;  


    const dt = new Date();
    console.log(`${symbol} current price ${priceStats.lastPrice} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    
    console.log(`Place orders at:`, params);

    threshold.buyCount = 2;
    threshold.sellCount = 2;

    if(assetTotal > threshold.overBought) {
        // Probably on a downward trend so expect to be trailing the market price
        // Hypothesis is that our buy price will lag and expect to catch retracements
        // whle our sell price will be close to recent lows and the last price. 
        threshold.buyCount = 3;
        threshold.sellCount = 1;
    } else if(assetTotal > threshold.long) {
        threshold.buyCount = 2;
        threshold.sellCount = 2;
    } 

    if(assetTotal < threshold.overSold) {
        // Probably on an upward trend so expect to be trailing the market price
        // see above ...  
        threshold.buyCount = 1;
        threshold.sellCount = 3;
    } else if(assetTotal < threshold.short) {
        threshold.buyCount = 2;
        threshold.sellCount = 2;
    } 

    console.log(`assetTotal: ${assetTotal} order count threshold: ${threshold.buyCount} ${threshold.sellCount}`);

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
            } else if((assetTotal< threshold.short) && params.buy[i] > (threshold.shortPct * position.mAvgSellPrice)) {
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
            if(++orderCount >= threshold.buyCount) break;
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
            
            if(++orderCount>=threshold.sellCount) break;
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