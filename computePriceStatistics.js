/* 
Given hourly data, the drift per hour is the percentage change in price over the hour. 
The mean daily drift is calcualted from the hourly drift by multiplying by 24.
The daily volatility is the standard deviation of the hourly returns, 
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
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));     
}
function transformToTimeSeries(kLines){
    return {
        open   : kLines.map(d => d.open),
        close  : kLines.map(d => d.close),
        high   : kLines.map(d => d.high),
        low    : kLines.map(d => d.low),
    };
}
function compute24hStatistcs(prices) {

    const returns = prices.slice(1).map((price, h) => (
        price - prices[h]) / prices[h]
    );
    
    const drift = (returns.reduce((sum, r) => sum + r, 0) / returns.length);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - drift, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) ;

    return {
        volatility,
        drift
    };
}
function getVariables(kLines){
    return {
        close  : kLines.map(d => (d.close - d.open)/d.open),
        high   : kLines.map(d => (d.high - d.open)/d.open),
        low    : kLines.map(d => (d.low - d.open)/d.open)
    };
}
function computeStats (timeSeries){
    const count = timeSeries.length;
    const mean = (timeSeries.reduce((sum, r) => sum + r, 0) / count); 
    const variance = timeSeries.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / count;
    const volatility = Math.sqrt(variance);
    return {
        mean: mean,
        volatility: volatility
    }     
}
async function computeAndLogStatistics(symbol) {
    try {
        const hourCount = 100;
        const kLines = await fetchHourlyKLines(symbol,hourCount);
        
        const priceTS = transformToTimeSeries(kLines);
        const stats = {
            close: compute24hStatistcs(priceTS.close)
        };
        const series = getVariables(kLines);
        const y = {
            symbol: symbol,
            close: computeStats(series.close),
            high: computeStats(series.high),
            low: computeStats(series.low)
        };

        console.log(stats);
        console.log(y);
    } catch (error) {
        console.error(error);    
    }
}
computeAndLogStatistics('BTCUSDC'); 
computeAndLogStatistics('ETHUSDC'); 
