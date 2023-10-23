/* 
Given hourly data, the return for each hour is the percentage change in price over the hour. 
The mean daily return is the mean of the hourly returns multiplied by 24.
The daily volatility is then the standard deviation of the hourly returns, 
multiplied by the square root of 24 to transform from hourly to daily volatility.
We fetch the hourly close prices from the k-lines endpoint with an interval of 1h.
https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
*/
const axios = require('axios');

async function getHourlyClosePrices(symbol, hourCount) {
    const interval = '1h'; 
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
            symbol: symbol,
            interval: interval,
            limit: hourCount,
        }
    });
    const prices = response.data.map(d => parseFloat(d[4]));
    if (prices.length == 0) {throw "Failed to fetch historical data.";}

    return prices; 
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
async function main(symbol) {
    try {

        const hourCount = 100;
        const prices = await getHourlyClosePrices(symbol,hourCount);
    
        const { volatility, meanReturn } = compute24hStatistcs(prices);
 
        console.log(`Daily Price Statistics for ${symbol} based on latest ${hourCount} hourly prices.`) 
        console.log(`   Volatility: ${volatility.toFixed(4)}`);
        console.log(`   Mean Return: ${meanReturn.toFixed(4)}`)    
        
    } catch (error) {
        console.error(error);    
    }
}

main('BTCUSDC'); 
main('ETHUSDC'); 
