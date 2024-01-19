const { fetchLastPrice, fetchAvgPrice } = require('./marketDataTxns');
const { fetchPriceStats } = require('./marketDataTxns');

async function fetchCurrentPrice(symbol, i, s) {
    let lastPrice = await fetchLastPrice(symbol);
    console.log(lastPrice);
    return lastPrice;
}
async function main() {
    //['BTCUSDC', 'ETHUSDC'].forEach(fetchCurrentPrice);
    if (require.main !== module) return;
    const symbol = process.argv[2];
    if(!symbol) throw 'Symbol not provided.'; 
    const priceStats = await fetchPriceStats(symbol);
    console.log(priceStats, '1h');
}    
if (require.main === module) main();

