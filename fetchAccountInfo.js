/*
We are interested in our current positions in the assets and currencies
we are trading in.  That is BTC, ETH, USDC and USDT.   
https://binance-docs.github.io/apidocs/spot/en/#spot-account-endpoints

Do we care about recent trading activity, average prices, p&l?
*/

const crypto = require('crypto');
const cfg = require('dotenv').config();
const API_SECRET = process.env.API_SECRET;

const { fetchAccountInfo } = require('./accountTxns');

function filterByAsset(asset, price, accountInfo){
    let b = accountInfo.balances.filter(balance => (balance.asset==asset))[0];
    return {
        qty  : b.total, 
        free : b.free,
        usd : Math.round(100*b.total*price)/100  
    };
}
async function main() {
    try {
        const noneZeroBalances =  await fetchAccountInfo();

        let balances = {
           USDC : filterByAsset('USDC',    1.00, noneZeroBalances),
           USDT : filterByAsset('USDT',    1.00, noneZeroBalances), 
           ETH  : filterByAsset('ETH',  2700.00, noneZeroBalances),
           BTC  : filterByAsset('BTC', 50000.00, noneZeroBalances), 
           BNB  : filterByAsset('BNB',   333.00, noneZeroBalances),
           XRP  : filterByAsset('XRP',     0.56, noneZeroBalances)
        }
        
        var b = Object.values(balances)
        let totalUsd = b.reduce((acc, item) => acc + item.usd, 0);

        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        console.log(`total: ${totalUsd}`);
        console.log(balances);

    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

if (require.main === module) main();


