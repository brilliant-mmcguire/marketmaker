/*
We are interested in our current positions in the assets and currencies
we are trading in.  That is BTC, ETH, USDC and USDT.   
https://binance-docs.github.io/apidocs/spot/en/#spot-account-endpoints

Do we care about recent trading activity, average prices, p&l?
*/


const { fetchPriceStats } = require('./marketDataTxns');
const crypto = require('crypto');
const cfg = require('dotenv').config();
const API_SECRET = process.env.API_SECRET;

const { fetchAccountInfo } = require('./accountTxns');

// Asset configuration
const SUPPORTED_ASSETS = {
    USDT: { 
        pair: 'USDTUSDT', 
        fixedPrice: 1.00  // Special case for USDT with fixed price
    },
    USDC: { pair: 'USDCUSDT' },
    BTC: { pair: 'BTCUSDT' },
    SOL: { pair: 'SOLUSDT' },
    ETH: { pair: 'ETHUSDT' },
    XRP: { pair: 'XRPUSDT' },
    ADA: { pair: 'ADAUSDT' },
    BNB: { pair: 'BNBUSDT' }
};

// Configuration constants
const PRICE_WINDOW = '4h';

function filterByAsset(asset, price, accountInfo){
    let b = accountInfo.balances.filter(balance => (balance.asset==asset))[0];
    let qt = b ? b.total : 0;
    let qf = b ? b.free : 0;
    return {
        qty  : qt, 
        usd  : Math.round(100*qt*price)/100,
        free : qf
    };
}

async function fetchAssetPrices() {
    const prices = {};
    for (const [asset, config] of Object.entries(SUPPORTED_ASSETS)) {
        if (config.fixedPrice) {
            prices[asset] = { weightedAvgPrice: config.fixedPrice };
        } else {
            prices[asset] = await fetchPriceStats(config.pair, PRICE_WINDOW);
        }
    }
    return prices;
}

async function main() {
    try {
        const noneZeroBalances = await fetchAccountInfo();
        const prices = await fetchAssetPrices();

        let balances = {};
        for (const [asset, config] of Object.entries(SUPPORTED_ASSETS)) {
            balances[asset] = filterByAsset(
                asset, 
                prices[asset].weightedAvgPrice,
                noneZeroBalances
            );
        }
        
        var b = Object.values(balances);
        let totalUsd = b.reduce((acc, item) => acc + item.usd, 0);
        totalUsd = Math.round(100*totalUsd)/100;   
       
        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        console.log(`total:      usd:${totalUsd}`);
        console.log(`usdt+usdc:  usd:${balances.USDT.usd + balances.USDC.usd} qty:${balances.USDT.qty + balances.USDC.qty}` );
        console.log(`btc+sol+xrp:    usd:${balances.XRP.usd+balances.SOL.usd+balances.BTC.usd}`);
        console.log(`eth+ada:usd:${balances.ADA.usd+balances.ETH.usd}`);
        console.log(balances);

    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

if (require.main === module) main();


