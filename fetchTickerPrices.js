const { fetchLastPrice, fetchAvgPrice } = require('./marketDataTxns');

async function fetchCurrentPrice(symbol, i, s) {
    let lastPrice = await fetchLastPrice(symbol);
    console.log(lastPrice);
    return lastPrice;
}
async function main() {
    ['BTCUSDC', 'ETHUSDC'].forEach(fetchCurrentPrice);
}    
main();
