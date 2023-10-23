/*
To help us calculate statistics, such as volatility, we will need to be able 
to fetch historic prices.  The time window will vary but for market making 
purposes the time intervals will typically be hourly or perhaps even every minute. 

https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
*/

const axios = require('axios');

async function getHourlyClosePrices(symbol, interval, limit) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: interval,
                limit: limit,
            }
        });
        return response.data.map(d => parseFloat(d[4])); 
    } catch (error) {
        console.error("Error fetching data:", error.message);
        return [];
    }
}

async function getHourlyKLines(symbol, interval, limit) {
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
        console.error("Error fetching data:", error.message);
        return [];
    }
}

async function fetchAndLogHourlyPrices(symbol) {   
    const interval = '1h';
    const intervalCount = 4;  // Small set to fit on the console output.

    const closeprices = await getHourlyClosePrices(symbol, interval, intervalCount);
    console.log(`Hourly closing prices for ${symbol}`);
    console.log(closeprices);

    const kLines = await getHourlyKLines(symbol, interval, intervalCount);
    console.log(`Hourly K-Lines for ${symbol}`);
    console.log(kLines);
}

fetchAndLogHourlyPrices('BTCUSDC');

fetchAndLogHourlyPrices('ETHUSDC');
