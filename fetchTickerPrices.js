/*---
The ticker/price endpoint returns the last trade price for the symbol.
https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker
---*/

const axios = require('axios');

async function fetchLastPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
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
    const btcPrice = await fetchLastPrice('BTCUSDC');
    const ethPrice = await fetchLastPrice('ETHUSDC');
}

main();
