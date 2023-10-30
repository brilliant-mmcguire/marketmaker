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

function filterBalances(accountInfo){
    return accountInfo.balances.filter(
        balance => (balance.free>0 || balance.locked>0)
    );
}
async function main() {
    try {
        const accountInfo =  await fetchAccountInfo();
        const noneZeroBalances = filterBalances(accountInfo);
        console.log(`Balances for uid ${accountInfo.uid} @ `, new Date());
        console.log(noneZeroBalances);    
    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

main()

