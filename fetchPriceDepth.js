const { fetchAvgPrice } = require('./marketDataTxns');
const { fetchKLines } = require('./marketDataTxns');
const { fetchPriceDepth } = require('./marketDataTxns');

async function avgPrices() {
    const btcPrice = await fetchAvgPrice('BTCUSDC');
    const btcKline = await fetchKLines('BTCUSDC', '4h', 1);
    const btcSpot = {
        symbol: 'BTCUSDC',
        avgPrice: btcPrice.price,
        kLine: btcKline[0]
    }

    const ethPrice = await fetchAvgPrice('ETHUSDC');
    const ethKline = await fetchKLines('ETHUSDC', '4h', 1);
    const ethSpot = {
        symbol: 'ETHUSDC',
        avgPrice: ethPrice.price,
        kLine: ethKline
    }
 
    console.log(btcSpot);
    console.log(ethSpot);
}

async function main() {
    const symbol = process.argv[2];
    if(!symbol) {
        console.log('Symbol not provided.'); 
        return; 
    }
    let depth = await fetchPriceDepth(symbol);
    console.log(depth);
}

if (require.main === module) main();