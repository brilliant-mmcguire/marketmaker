/* 
Given hourly data, the return for each hour is the percentage change in price over the hour. 
The mean daily return is the mean of the hourly returns multiplied by 24.
The daily volatility is then the standard deviation of the hourly returns, 
multiplied by the square root of 24 to transform from hourly to daily volatility.
We fetch the hourly low, high and close prices from the k-lines endpoint 
with an interval of 1 hour.
https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
*/
const axios = require('axios');

async function fetchHourlyKLines(symbol, hourCount) {
    const interval = '1h'; 
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
            symbol: symbol,
            interval: interval,
            limit: hourCount,
        }
    });
    return response.data.map(d => ({
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));     
}
function transformToTimeSeries(kLines){
    return {
        close : kLines.map(d => d.close),
        high : kLines.map(d => d.high),
        low : kLines.map(d => d.low)
    };
}
function compute24hStatistcs(prices) {
    const returns = prices.slice(1).map((price, h) => (
        price - prices[h]) / prices[h]
        );
    const meanReturn = (returns.reduce((sum, r) => sum + r, 0) / returns.length) * 24;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn/24, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(24);

    return {
        volatility,
        meanReturn
    };
}
async function computeAndLogStatistics(symbol) {
    try {
        const hourCount = 100;
        const klines = await fetchHourlyKLines(symbol,hourCount);
        const priceTS = transformToTimeSeries(klines);

        const stats = {
            close: compute24hStatistcs(priceTS.close),
            high: compute24hStatistcs(priceTS.high),
            low: compute24hStatistcs(priceTS.low)
        };

        console.log(`Daily Price Statistics for ${symbol} based on latest ${hourCount} hourly prices.`); 
        console.log(stats);

    } catch (error) {
        console.error(error);    
    }
}
computeAndLogStatistics('BTCUSDC'); 
computeAndLogStatistics('ETHUSDC'); 
