const { fetchKLines } = require('./marketDataTxns');

function transformToTimeSeries(kLines){
    return {
        hour : kLines.map(d => d.openTime.getHours()), 
        open : kLines.map(d => d.open),
        close : kLines.map(d => d.close),
        high : kLines.map(d => d.high),
        low : kLines.map(d => d.low)
    };
}
async function fetchAndLogHourlyPrices(symbol) {   
    const interval = '1h';
    const intervalCount = 4;  // Small set to fit on the console output.
    try {
        const kLines = await fetchKLines(symbol, interval, intervalCount);
        console.log(`Hourly price K-LINES for ${symbol}`, kLines);

        const prices = transformToTimeSeries(kLines);
        console.log(`Hourly price time series for ${symbol}`, prices);
    } catch (error) {
        console.error("Error fetching Hourly Prices", error.message);
    } 
}

fetchAndLogHourlyPrices('BTCUSDC');
fetchAndLogHourlyPrices('ETHUSDC');
fetchAndLogHourlyPrices('USDCUSDT');

