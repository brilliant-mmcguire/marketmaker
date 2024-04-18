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

const lotSize = 0.00033; //BTC
//const posnTarget = 15*lotSize; 
//const posnHi = posnTarget + 5*lotSize;  
//const posnLo = posnTarget - 5*lotSize;

const threshold = { 
    target : 300, 
    deviation : 100, 
    pricePct : 0.032, // at one deviation.

    buyCount : 2,
    sellCount : 2,
};

function getOrderParameters(priceStats) {

    // Base prices: midway between current price (close) and the high or low. 
    const sellBasePrc = 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = 0.5*(priceStats.lastPrice + priceStats.lowPrice);
   
    return {
        quantity : lotSize,
        lastPrice : priceStats.lastPrice, 
        hiPrice : priceStats.highPrice,
        loPrice : priceStats.lowPrice,
        weightedAvgPrice : priceStats.weightedAvgPrice,
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

function updateThreshold(posnDeviation) {
    threshold.buyCount = 2;
    threshold.sellCount = 2;

    if(posnDeviation>0.9) {
        // Probably on a downward trend so expect to be trailing the market price
        // Hypothesis is that our buy price will lag and expect to catch retracements
        // whle our sell price will be close to recent lows and the last price. 

        /*
        I've forgotten why I set the buy count in this contrainrian fashion.  Backing out for now. 
        threshold.buyCount = 3;
        threshold.sellCount = 1;
        */
    } 

    if(posnDeviation < -0.9) {
        // Probably on an upward trend so expect to be trailing the market price
        // see above ...  
        
        /*
        I've forgotten why I set the buy count in this contrainrian fashion.  Backing out for now. 
        threshold.buyCount = 1;
        threshold.sellCount = 3;
        */
    } 
}

exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, position, balance, priceStats) {
    const params = getOrderParameters(priceStats);

    assetTotal = balance.total * priceStats.weightedAvgPrice;  

    const dt = new Date();
    console.log(`${symbol} current price ${priceStats.lastPrice} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    console.log(`Place orders at:`, params);

    let relativePosn = (assetTotal-threshold.target)/threshold.deviation;
    
    updateThreshold(relativePosn);

    let prcPct = 1.0 - relativePosn*Math.abs(relativePosn)*threshold.pricePct;  
    
    let buyPrcCeiling = prcPct * position.mAvgBuyPrice;
    let sellPrcFloor = prcPct * position.mAvgSellPrice;

    console.log(`assetTotal: ${assetTotal} ; posDeviation: ${relativePosn}` );
    console.log(`Avg buy price: ${ position.mAvgBuyPrice} ; Avg sell price: ${position.mAvgSellPrice}.`);
    console.log(threshold);
   
    try {  // Make bids.
        if(relativePosn > 0)  console.log(
                `Long posn @ avg buy price ${position.mAvgBuyPrice}. Ceiling: ${buyPrcCeiling}. Buy more at lower price.`
            );
        if(relativePosn < 0) console.log(
                `Short posn @ avg sell price ${position.mAvgSellPrice}. Ceiling: ${buyPrcCeiling}. Tension between closing position and realising a loss.`
            );
        
        let orderCount=0;
        for (let i = params.buy.length-1; i > 0; i--) {
            if(params.buy[i] > buyPrcCeiling) {
                console.log(`> Buy price ${params.buy[i]} is greater than ceiling ${buyPrcCeiling}. Ignore order`);
                continue;
            } 
            const buyOrder = await placeOrder(
                'BUY', 
                params.quantity, 
                symbol, 
                params.buy[i]
            );
            console.log(`Placed: ${buyOrder.side} ${buyOrder.origQty} ${buyOrder.symbol} @ ${buyOrder.price}`);
            if(++orderCount >= threshold.buyCount) break;
        }
    } catch (error) {
        console.log(`Error thrown placing buy order ${error}`);
    }

    try { // Make offers.
        if(relativePosn > 0) console.log(
                `Long posn @ ${position.mAvgBuyPrice}. Floor ${sellPrcFloor}.  Tension between closing position and realising a loss.` 
            );
        
        if(relativePosn < 0) console.log(
                `Short posn @ avg sell price ${position.mAvgSellPrice}. Floor ${sellPrcFloor}. Sell more at higher price.`
            );
       
        let orderCount=0; 
        
        for (let i = params.sell.length-1; i > 0;  i--) {
            if( params.sell[i] < sellPrcFloor) {
                console.log(`> Sell price ${params.sell[i]} is less than floor ${sellPrcFloor}. Ignore order.`);
                continue;
            }

            const sellOrder = await placeOrder(
                'SELL', 
                params.quantity, 
                symbol, 
                params.sell[i]
            );
            console.log(`Placed: ${sellOrder.side} ${sellOrder.origQty} ${sellOrder.symbol} @ ${sellOrder.price}`);
            
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
  
    const position = await fetchPositions(symbol, 3);
    const priceStats  = await fetchPriceStats(symbol, '1h');
    const noneZeroBalances =  await fetchAccountInfo();

    let balance = {};
    if(symbol.startsWith("BTC")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='BTC'))[0];
    else throw 'Symbol not for BTC.'

    await cancelOpenOrders(symbol);
/*
    if(symbol.startsWith("ETH")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='ETH'))[0];

    if(symbol.startsWith("XRP")) 
        balance = noneZeroBalances.balances.filter(balance => (balance.asset=='XRP'))[0];
*/

    //console.log(`Targeting ${posnTarget} BTC with hi ${posnHi}, lo ${posnLo}, and lot size of ${lotSize}`)
    console.log(`Balance:`, balance);

    await placeNewOrders(symbol, position, balance, priceStats); 
}

async function main() {
    let symbol = process.argv[2];
    if(!symbol) symbol = 'BTCUSDT'; 

    console.log(`replace ${symbol} orders.`);

    try {
        await replaceOrders(symbol);
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}
if (require.main === module) main();