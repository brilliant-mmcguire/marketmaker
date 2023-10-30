const { fetchAvgPrice } = require('./marketDataTxns');

async function main() {
    const btcPrice = await fetchAvgPrice('BTCUSDC');
    const ethPrice = await fetchAvgPrice('ETHUSDC');
    console.log(btcPrice);
    console.log(ethPrice);
}

main();
