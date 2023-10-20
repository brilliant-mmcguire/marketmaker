const axios = require('axios');

async function fetchLatestPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
            params: {
                symbol: symbol,
            }
        });
        return response.data.price;
    } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return null;
    }
}

async function main() {
    const btcPrice = await fetchLatestPrice('BTCUSDC');
    const ethPrice = await fetchLatestPrice('ETHUSDC');

    console.log(`Latest BTCUSDC Price: $${btcPrice}`);
    console.log(`Latest ETHUSDC Price: $${ethPrice}`);
}

main();
