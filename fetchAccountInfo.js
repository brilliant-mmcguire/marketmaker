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

async function main() {
    try {
        const noneZeroBalances =  await fetchAccountInfo();

        let balances = {
           usdc : noneZeroBalances.balances.filter(balance => (balance.asset=='USDC'))[0],
           usdt : noneZeroBalances.balances.filter(balance => (balance.asset=='USDT'))[0]
        }

        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        //console.log(noneZeroBalances);    
        console.log(balances);

    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

if (require.main === module) main();


