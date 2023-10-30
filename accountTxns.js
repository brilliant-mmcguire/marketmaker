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
exports.fetchAccountInfo = fetchAccountInfo;
