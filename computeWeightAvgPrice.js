const axios = require('axios');

async function getAverageTradePrice(symbol, interval) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/aggTrades', {
            params: {
                symbol: symbol,
                startTime: Date.now() - interval,
                endTime: Date.now(),
            }
        });
        
        const trades = response.data;
        if (trades.length === 0) {
            throw new Error('No trade data found for the last hour.');
        }

        const sumPrice = trades.reduce((acc, trade) => acc + parseFloat(trade.p) * parseFloat(trade.q), 0);
        const sumQuantity = trades.reduce((acc, trade) => acc + parseFloat(trade.q), 0);
        
        const averagePrice = sumPrice / sumQuantity;
        
        console.log(`Average trade price for ${symbol} over the last hour: ${averagePrice}`);
        return averagePrice;
    } catch (error) {
        console.error(`Error fetching trade data: ${error.message}`);
    }
}

// Run the function to get average trade price for BTCUSDT over the last hour (3600000 milliseconds)
getAverageTradePrice('BTCUSDT', 3600000);
