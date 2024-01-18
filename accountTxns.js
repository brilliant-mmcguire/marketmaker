/*
https://binance-docs.github.io/apidocs/spot/en/#spot-account-endpoints
*/
const axios = require('axios');
const crypto = require('crypto');
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const createSignature = (query) => {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
};

function filterBalances(accountInfo){
    return accountInfo.balances.filter(
        balance => (balance.free>0 || balance.locked>0)
    );
}

exports.fetchAccountInfo = fetchAccountInfo;
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
    
    const noneZeroBalances = filterBalances(response.data);

    return {
        uid : response.data.uid,
        timestamp : timestamp,
        balances: noneZeroBalances.map(nzb => ({
            asset: nzb.asset,
            free: parseFloat(nzb.free),
            locked: parseFloat(nzb.locked),
            total: (parseFloat(nzb.free) + parseFloat(nzb.locked))
        }))
    }
}

