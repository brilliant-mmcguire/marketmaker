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
const posnTarget = 15*lotSize; 
const posnDeviation = 5*lotSize;
//const posnHi = 20*lotSize;  
//const posnLo = 10*lotSize;

const target = { 
    coinQty : 15*lotSize, 
    coinQtyDeviation : 5*lotSize 
}

const threshold = { 
    target : 300, //USDT 
    deviation : 100,  //USDT
    pricePct : 0.032, // at one deviation.

    buyCount : 2,
    sellCount : 2,
};

function getTradeSignals(priceStats) {

    // Base prices: midway between current price and the high or low. 
    const sellBasePrc = 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = 0.5*(priceStats.lastPrice + priceStats.lowPrice);
   
    return {
        quantity : lotSize,
        lastPrice : priceStats.lastPrice, 
        hiPrice : priceStats.highPrice,
        loPrice : priceStats.lowPrice,
        weightedAvgPrice : priceStats.weightedAvgPrice,
        sellBasePrc : sellBasePrc,
        buyBasePrice : buyBasePrice,
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

function taperTradePrice(avgTradePrice, avgTradeAage, markPrice) {
    // Weight our avg trade price with the market price depending on the age of our trades. 
    // If we have'd traded for a while (up to 7 hours), we tend to the hourly weighted market price.   
    const age = Math.max(7.0 - avgTradeAage,0)/7.0; 
    console.assert(age<=1.0 && age >=0.0 ,`0 <= scaled trade age <= 1`);

    return age*avgTradePrice + (1.0-age)*markPrice; 
}

exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, tradingPos, totalQty, priceStats) {
    const tradeSignals = getTradeSignals(priceStats);
    const btcPos = {
        coinQty  : totalQty,
        markPrice : priceStats.weightedAvgPrice,  // Mark to market price. 
        quoteQty : totalQty * priceStats.weightedAvgPrice,
     }
    
    console.log(`Coin position:`, btcPos); 
    console.log(`Trade signals:`, tradeSignals);
    
   // let quoteQtyDeviation = (btcPos.quoteQty-threshold.target)/threshold.deviation;
    let coinDeviation = (btcPos.coinQty-target.coinQty)/target.coinQtyDeviation;
    //let relativePosn = coinQtyDeviation;
    let prcPct = 1.0 - coinDeviation*Math.abs(coinDeviation)*threshold.pricePct;  

    let buyPrcCeiling = prcPct * taperTradePrice(
        tradingPos.mAvgBuyPrice,
        tradingPos.mAvgBuyAge,
        priceStats.weightedAvgPrice);

    let sellPrcFloor = prcPct * taperTradePrice(
        tradingPos.mAvgSellPrice,
        tradingPos.mAvgSellAge, 
        priceStats.weightedAvgPrice);

   
    guardRails = {
        markPrice : priceStats.weightedAvgPrice,
        coinQty : btcPos.coinQty,
        quoteQty : btcPos.quoteQty,
        targetQty : posnTarget,
       // targetQuoteQty  : threshold.target,
        coinDeviation : (btcPos.coinQty-target.coinQty)/target.coinQtyDeviation,
        //quoteQtyDeviation : (btcPos.quoteQty-threshold.target)/threshold.deviation,
        //prcTolerance : quoteQtyDeviation*Math.abs(quoteQtyDeviation)*threshold.pricePct,
        prcTolerance : coinDeviation * Math.abs(coinDeviation) * threshold.pricePct,
        buys : {
            avgPrc : tradingPos.mAvgBuyPrice,
            avgAge : tradingPos.mAvgBuyAge,
            prcCeiling : buyPrcCeiling,
        },
        sells : { 
            avgPrc : tradingPos.mAvgSellPrice,
            avgAge : tradingPos.mAvgSellAge,
            prcFloor : sellPrcFloor,
        } 
    }
    
    console.log(`Guard rails: `, guardRails);
    //console.log(`QQ balance: ${btcPos.quoteQty} ; posDeviation: ${relativePosn}` );
    //console.log(`Avg buy price: ${tradingPos.mAvgBuyPrice} ; Avg sell price: ${tradingPos.mAvgSellPrice}.`);
    //console.log(threshold);
   
    try {  // Make bids.
        if(coinDeviation > 0)  console.log(
                `Make bids. Long posn @ avg buy price ${tradingPos.mAvgBuyPrice}. Ceiling: ${buyPrcCeiling}. Buy more at lower price.`
            );
        if(coinDeviation < 0) console.log(
                `Make bids. Short posn @ avg sell price ${tradingPos.mAvgSellPrice}. Ceiling: ${buyPrcCeiling}. Tension between closing position and realising a loss.`
            );
        
        let orderCount=0;
        for (let i = tradeSignals.buy.length-1; i > 0; i--) {
            if(tradeSignals.buy[i] > buyPrcCeiling) {
                console.log(`> Buy price ${tradeSignals.buy[i]} is greater than ceiling ${buyPrcCeiling}. Ignore order`);
                continue;
            } 
            const buyOrder = await placeOrder(
                'BUY', 
                tradeSignals.quantity, 
                symbol, 
                tradeSignals.buy[i]
            );
            console.log(`> Placed: ${buyOrder.side} ${buyOrder.origQty} ${buyOrder.symbol} @ ${buyOrder.price}`);
            if(++orderCount >= threshold.buyCount) break;
        }
    } catch (error) {
        console.log(`Error thrown placing buy order ${error}`);
    }

    try { // Make offers.
        if(coinDeviation > 0) console.log(
                `Make offers. Long posn @ ${tradingPos.mAvgBuyPrice}. Floor ${sellPrcFloor}.  Tension between closing position and realising a loss.` 
            );
        
        if(coinDeviation < 0) console.log(
                `Make offers. Short posn @ avg sell price ${tradingPos.mAvgSellPrice}. Floor ${sellPrcFloor}. Sell more at higher price.`
            );
       
        let orderCount=0; 
        
        for (let i = tradeSignals.sell.length-1; i > 0;  i--) {
            if( tradeSignals.sell[i] < sellPrcFloor) {
                console.log(`> Sell price ${tradeSignals.sell[i]} is less than floor ${sellPrcFloor}. Ignore order.`);
                continue;
            }

            const sellOrder = await placeOrder(
                'SELL', 
                tradeSignals.quantity, 
                symbol, 
                tradeSignals.sell[i]
            );
            console.log(`> Placed: ${sellOrder.side} ${sellOrder.origQty} ${sellOrder.symbol} @ ${sellOrder.price}`);
            
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
    const tradingPos = await fetchPositions(symbol, 3);
    const priceStats  = await fetchPriceStats(symbol, '1h');
    const noneZeroBalances =  await fetchAccountInfo();

    let btcBalance = {};
    if(symbol.startsWith("BTC")) 
        btcBalance = noneZeroBalances.balances.filter(balance => (balance.asset=='BTC'))[0];
    else throw 'Symbol not for BTC.'

    await cancelOpenOrders(symbol);

    //console.log(`Targeting ${posnTarget} BTC with hi ${posnHi}, lo ${posnLo}, and lot size of ${lotSize}`)

    await placeNewOrders(symbol, tradingPos, btcBalance.total, priceStats); 
}

async function main() {
    let symbol = process.argv[2];
    if(!symbol) symbol = 'BTCUSDT'; 

    console.log(`replace ${symbol} orders ${new Date().toLocaleString()}`);

    try {
        await replaceOrders(symbol);
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}
if (require.main === module) main();