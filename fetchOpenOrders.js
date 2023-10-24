/*
We may need to check our open orders to make trading decisions. 
https://binance-docs.github.io/apidocs/spot/en/#current-open-orders-user_data
*/
const cfg = require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const createSignature = (query) => {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

const fetchOpenOrders = async (symbol) => {
    const endpoint = '/api/v3/openOrders';
    const timestamp = Date.now();
    const query = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    const url = `https://api.binance.com${endpoint}?${query}&signature=${signature}`;
    
    const response = await axios({
        method: 'GET',
        url: url,
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data.map(d => ({
        orderId : d.orderId,
        side    : d.side,
        origQty : d.origQty,
        symbol  : d.symbol,
        price   : d.price
    }));   
};
const fetchAndLogOrders = async (symbol) => {
    const orders = await fetchOpenOrders(symbol);
    console.log(`${orders.length} ${symbol} open orders`, new Date());   
    console.log(orders);
}
fetchAndLogOrders('ETHUSDC');
fetchAndLogOrders('BTCUSDC');