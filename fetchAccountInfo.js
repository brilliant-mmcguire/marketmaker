/*
We are interested in our current positions in the assets and currencies
we are trading in.  That is BTC, ETH, USDC and USDT.   
https://binance-docs.github.io/apidocs/spot/en/#spot-account-endpoints

Do we care about recent trading activity, average prices, p&l?
*/

const cfg = require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const createSignature = (query) => {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}
async function fetchAccountInfo() {
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = createSignature(query);
    const url = `https://api.binance.com/api/v3/account?${query}&signature=${signature}`;

    const response = await axios({
        method: 'GET',
        url: url,
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data;
}
function filterBalances(accountInfo){
    return accountInfo.balances.filter(
        balance => (balance.free>0 || balance.locked>0)
    );
}
async function main() {
    const accountInfo =  await fetchAccountInfo();
    const noneZeroBalances = filterBalances(accountInfo);
    console.log(`Balances for uid ${accountInfo.uid} @ `, new Date());
    console.log(noneZeroBalances);

}

main()

