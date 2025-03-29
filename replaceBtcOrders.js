/*
Execute a sweep of a mean-reverting trading strategy.

Cancel all open orders and then place new orders in a small grid around the current spot price. 
Orders are priced so that they are within the expected hourly highs and lows.

Problem to solve: During strong moves with momentum up (or down) are over selling the asset and running out of coinage/liquidity.  
So, need to be more demanding on asking price to reduce over selling / buying. 

The trading pair being used while writing this script is SOLBTC.  

Write this from scratch ... 

This script will place only one order with the intent of having that order execute in the near future. 
For now, avoid market orders and aim to place the order at, say, 0.1% from the last trade price. 

If the position is overbought then sell even if realising a loss so as to gain liquidity. 
Likewise, if oversold then buy even if realising a loss. 

Trading signals are based on a mean reverting logic...  

When price is a above the expected price and is drifting back toward that expected price then place a sell order.
Likewise, when the price is below expected price and is moving back toward the expected price then place a buy order. 

Hardcode the expected price and trading range.  
The bounds act as stop levels to prevent trading. 
Else, set positon range to dictate trading behaviour and inhibit over buying / selling 
when the price has migrated out of the expected range.
Or, calculate as average trade price. 

*/

const { placeOrder } = require('./orderTxns');
const { fetchPositions } = require('./fetchTrades');
const { fetchPriceStats } = require('./marketDataTxns');
const { cancelOpenOrders } = require('./orderTxns');
const { fetchAccountInfo } = require('./accountTxns');

// Custom Error Classes
class TradingError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'TradingError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date();
    }
}

class ValidationError extends TradingError {
    constructor(message, details) {
        super(message, 'VALIDATION_ERROR', details);
    }
}

class OrderPlacementError extends TradingError {
    constructor(message, details) {
        super(message, 'ORDER_PLACEMENT_ERROR', details);
    }
}

// Validation Functions
function validateSymbol(symbol) {
    const validSymbols = ["SOLBTC", "ETHBTC", "XRPETH", "XRPBTC", "ADAETH", "ADABTC", "XLMETH"];
    if (!symbol) {
        throw new ValidationError('Symbol is required');
    }
    if (!validSymbols.includes(symbol)) {
        throw new ValidationError('Invalid trading pair', { symbol, validSymbols });
    }
}

function validatePriceStats(priceStats) {
    const requiredFields = ['weightedAvgPrice', 'lastPrice', 'highPrice', 'lowPrice'];
    const missingFields = requiredFields.filter(field => !priceStats[field]);
    
    if (missingFields.length > 0) {
        throw new ValidationError('Invalid price stats', { missingFields });
    }
}

// Retry Utility
async function withRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === maxRetries) break;
            
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.log(`Retry attempt ${attempt} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new TradingError(
        `Operation failed after ${maxRetries} attempts`,
        'RETRY_EXHAUSTED',
        { originalError: lastError }
    );
}

/* 
At time of writing SOL is trading at around $230 so the chosen lot size is about £23, the target position is about $350.
The position deviation of 5 lots is about £115. Need an explaination of tolerance.  
*/

const posnTarget =  0; // 15*lotSize;  // which is about $345 
const posnDeviation = 0; //5*lotSize;  // which is about $115 

const target = { 
    coinQty : 0, //15*lotSize, 
    coinQtyDeviation : 0 //5*lotSize 
}

const threshold = { 
    target : 300,     //USDT 
    deviation : 100,  //USDT
    pricePct : 0.032, // at one deviation.

    buyCount : 2,
    sellCount : 2,
};

function getTradeSignals(priceStats, tickSize) {

    // Base prices: midway between current price and recent high or low. 
    const sellBasePrc =  Math.max(priceStats.weightedAvgPrice,priceStats.lastPrice); // 0.5*(priceStats.lastPrice + priceStats.highPrice); 
    const buyBasePrice = Math.min(priceStats.weightedAvgPrice,priceStats.lastPrice); // 0.5*(priceStats.lastPrice + priceStats.lowPrice);
    const factor = 1/tickSize; 

    return {
        lastPrice : priceStats.lastPrice, 
        hiPrice : priceStats.highPrice,
        loPrice : priceStats.lowPrice,
        weightedAvgPrice : priceStats.weightedAvgPrice,
        sellBasePrc : sellBasePrc,
        buyBasePrice : buyBasePrice,
        sell : [
            Math.round((sellBasePrc * 1.0100) * factor)/factor,
            Math.round((sellBasePrc * 1.0060) * factor)/factor,
            Math.round((sellBasePrc * 1.0030) * factor)/factor,
        ],
        buy : [
            Math.round((buyBasePrice * 0.9900) * factor)/factor,
            Math.round((buyBasePrice * 0.9940) * factor)/factor,
            Math.round((buyBasePrice * 0.9970) * factor)/factor,
        ]
    }
}

/*
Weight avg trade price with the market price depending on the age of our trades. 
If haven't traded for a while (up to 7 hours), skew toward the hourly weighted market price.   
*/
function taperTradePrice(avgTradePrice, avgTradeAage, markPrice) {
    const age = Math.max(24.0 - avgTradeAage,0)/24.0; 
    console.assert(age<=1.0 && age >=0.0 ,`0 <= scaled trade age <= 1`);
    return age*avgTradePrice + (1.0-age)*markPrice; 
}


exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, tradingPos, totalQty, priceStats) {

    const tradeSignals = getTradeSignals(priceStats);
    const coinPos = {
        coinQty  : totalQty,
        markPrice : priceStats.weightedAvgPrice,  // Mark to market price. 
        quoteQty : totalQty * priceStats.weightedAvgPrice,
    }

    console.log(`Coin position:`, coinPos); 
    console.log(`Trade signals:`, tradeSignals);
    
    // Deviation from target position. 
    let coinDeviation = (coinPos.coinQty-target.coinQty)/target.coinQty;
    
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
        coinQty : coinPos.coinQty,
        quoteQty : coinPos.quoteQty,
        targetQty : posnTarget,
        coinDeviation : (coinPos.coinQty-target.coinQty)/target.coinQtyDeviation,
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

async function placeOrders(symbol, orderSide, lotSize, priceLevels) {
    const orders = [];
    const errors = [];

    for (const price of priceLevels) {
        try {
            const order = await withRetry(() => 
                placeOrder(orderSide, lotSize, symbol, price)
            );
            orders.push(order);
            console.log(`Placed ${orderSide} order: ${symbol} ${lotSize} @ ${price}`);
        } catch (error) {
            errors.push({ price, error: error.message });
            console.error(`Failed ${orderSide} order: ${symbol} ${lotSize} @ ${price} - ${error.message}`);
        }
    }

    if (errors.length > 0) {
        throw new OrderPlacementError(
            `Failed to place ${errors.length} ${orderSide} orders for ${symbol}`,
            { failedOrders: errors }
        );
    }

    return orders;
}

exports.replaceOrders = replaceOrders;
async function replaceOrders(symbol) {
    try {
        validateSymbol(symbol);
        
        let lotSize = 0.0;
        let tickSize = 0.0000001;

        switch(symbol) {
         case "SOLBTC": lotSize =  0.08;  tickSize = 0.0000001; break; 
         case "ETHBTC": lotSize =  0.005; tickSize = 0.0001; break; 
         case "XRPETH": lotSize =  5.00;  break; 
         case "XRPBTC": lotSize =  5.00;  break;
         case "ADAETH": lotSize = 15.00;  tickSize = 0.0000001; break; 
         case "ADABTC": lotSize = 15.00;  tickSize = 0.0000001; break; 
         case "XLMETH": lotSize = 40.00;  tickSize = 0.0000001; break; 
         default: throw new ValidationError('Symbol not recognised', { symbol });
        }

        const priceStats = await withRetry(() => fetchPriceStats(symbol, '2h'));
        validatePriceStats(priceStats);

        const tradeSignals = getTradeSignals(priceStats, tickSize);
        
        await withRetry(() => cancelOpenOrders(symbol));
        console.log(`Cancelled existing orders for ${symbol}`);
        
        await Promise.all([
            placeOrders(symbol, 'BUY', lotSize, tradeSignals.buy),
            placeOrders(symbol, 'SELL', lotSize, tradeSignals.sell)
        ]);
        
    } catch (error) {
        if (error instanceof OrderPlacementError) {
            console.error(`Order placement failed: ${error.message}`);
            console.error('Failed orders:', error.details.failedOrders.map(
                o => `${symbol} @ ${o.price} - ${o.error}`
            ).join('\n'));
        } else if (error instanceof TradingError) {
            console.error(`Trading error: ${error.code} - ${error.message}`);
        } else {
            console.error(`Unexpected error: ${error.message}`);
        }
        throw error;
    }
}

async function main() {
    let cleanup = false;
    
    async function handleShutdown() {
        if (cleanup) return;
        cleanup = true;
        
        console.log('Shutting down gracefully...');
        try {
            const symbol = process.argv[2];
            if (symbol) {
                await cancelOpenOrders(symbol);
                console.log('Cancelled open orders');
            }
        } catch (error) {
            console.error(`Shutdown error: ${error.message}`);
        }
        process.exit(0);
    }

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    try {
        const symbol = process.argv[2];
        if (!symbol) {
            throw new ValidationError('Symbol not defined');
        }

        console.log(`Starting order replacement for ${symbol}`);
        await replaceOrders(symbol);
    } catch (error) {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) main();