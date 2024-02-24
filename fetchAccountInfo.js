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

function filterByAsset(asset, price, accountInfo){
    let b = accountInfo.balances.filter(balance => (balance.asset==asset))[0];
    return {
        qty  : b.total, 
        usd : Math.round(100*b.total*price)/100,
        free : Math.round(100*b.free*price)/100
    };
}
async function main() {
    try {
        const prcWindow = '3d';
        const noneZeroBalances =  await fetchAccountInfo();
        const prcETH = await fetchPriceStats('ETHUSDT', prcWindow);
        const prcBTC = await fetchPriceStats('BTCUSDT', prcWindow);
        const prcBNB = await fetchPriceStats('BNBUSDT', prcWindow);
        const prcXRP = await fetchPriceStats('XRPUSDT', prcWindow);

        let balances = {
           USDC : filterByAsset('USDC', 1.00, noneZeroBalances),
           USDT : filterByAsset('USDT', 1.00, noneZeroBalances), 
           ETH  : filterByAsset('ETH', prcETH.weightedAvgPrice, noneZeroBalances),
           BTC  : filterByAsset('BTC', prcBTC.weightedAvgPrice, noneZeroBalances), 
           BNB  : filterByAsset('BNB', prcBNB.weightedAvgPrice, noneZeroBalances),
           XRP  : filterByAsset('XRP', prcXRP.weightedAvgPrice, noneZeroBalances)
        }
        
        var b = Object.values(balances)
        let totalUsd = b.reduce((acc, item) => acc + item.usd, 0);
        totalUsd =  Math.round(100*totalUsd)/100;

        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        console.log(`total: ${totalUsd}`);
        console.log(balances);

    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

if (require.main === module) main();


