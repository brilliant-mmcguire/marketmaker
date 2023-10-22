/*
To help us calculate statistics, such as volatility, we will need to be able 
to fetch historic prices.  The time window will vary but for market making 
purposes the time intervals will typically be hourly or perhaps even every minute. 

https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
*/

const axios = require('axios');

async function getHistoricalData(symbol, interval, limit) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: interval,
                limit: limit,
            }
        });
        return response.data.map(d => ({
            openTimeUT: d[0],
            openTime: new Date(d[0]),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4])
        }));
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function fetchAndLogHourlyPrices(symbol) {   
    const interval = '1h';
    const intervalCount = 12;  // This is arbitarily chosen to fit on the console output.
    const historicalData = await getHistoricalData(symbol, interval, intervalCount);
    console.log(`Hourly k-lines for ${symbol}`);
    console.log(historicalData);
}

fetchAndLogHourlyPrices('BTCUSDC');
fetchAndLogHourlyPrices('ETHUSDC');
