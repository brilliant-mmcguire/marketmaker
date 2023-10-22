/*---
The avgPrice endpoint returns the average price for the last five minutes.
https://binance-docs.github.io/apidocs/spot/en/#current-average-price
---*/

const axios = require('axios');

async function fetchAvgPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/avgPrice', {
            params: {
                symbol: symbol,
            }
        });
        console.log(`${symbol}:`, response.data);
        return response.data.price;
    } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return null;
    }
}

async function main() {
    const btcPrice = await fetchAvgPrice('BTCUSDC');
    const ethPrice = await fetchAvgPrice('ETHUSDC');
}

main();
