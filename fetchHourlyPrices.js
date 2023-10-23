/*
To help us calculate statistics, such as volatility, we will need to be able 
to fetch historic prices.  The time window will vary but for market making 
purposes the time intervals will typically be hourly or perhaps even every minute. 

https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
*/

const axios = require('axios');

async function getKLines(symbol, interval, limit) {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
            symbol: symbol,
            interval: interval,
            limit: limit,
        }
    });
    return response.data.map(d => ({
        openTime: new Date(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));     
}

async function fetchAndLogHourlyPrices(symbol) {   
    const interval = '1h';
    const intervalCount = 4;  // Small set to fit on the console output.
    try {
        const kLines = await getKLines(symbol, interval, intervalCount);
        console.log(`Hourly price K-LINES for ${symbol}`, kLines);

        const prices = {
            openTime : kLines.map(d => d.openTime), 
            open : kLines.map(d => d.open),
            close : kLines.map(d => d.close),
            high : kLines.map(d => d.high),
            low : kLines.map(d => d.low)
        };
        console.log(`Hourly price time series for ${symbol}`, prices);
    } catch (error) {
        console.error("Error fetching Hourly Prices", error.message);
    } 

}

fetchAndLogHourlyPrices('BTCUSDC');
fetchAndLogHourlyPrices('ETHUSDC');
