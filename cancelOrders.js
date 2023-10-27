/*
We can cancel orders for a given symbol to clear them out before placing new orders.
https://binance-docs.github.io/apidocs/spot/en/#cancel-order-trade
*/
const cfg = require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

const BASE_URL = 'https://api.binance.com';

async function fetchOpenOrders(symbol) {
    const endpoint = '/api/v3/openOrders';
    const timestamp = Date.now();
    const query = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = createSignature(query);
    const url = `${BASE_URL}${endpoint}?${query}&signature=${signature}`;

    const response = await axios.get(url, {
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data.map(d => ({
        orderId: d.orderId,
        side: d.side,
        origQty: d.origQty,
        symbol: d.symbol,
        price: d.price
    }));
}
/*
async function fetchOpenOrders(symbol) {
    const endpoint = '/api/v3/openOrders';
    const timestamp = Date.now();
    const query = `symbol=${symbol}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    const url = `${BASE_URL}${endpoint}?${query}&signature=${signature}`;

    const response = await axios({
        method: 'GET',
        url: url,
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data.map(d => ({
        orderId: d.orderId,
        side: d.side,
        origQty: d.origQty,
        symbol: d.symbol,
        price: d.price
    }));
}
*/

async function cancelOrder(symbol, orderId) {
    const endpoint = '/api/v3/order';
    const timestamp = Date.now();
    const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    const url = `${BASE_URL}${endpoint}?${query}&signature=${signature}`;

    try {
        const response = await axios({
            method: 'DELETE',
            url: url,
            headers: {
                'X-MBX-APIKEY': API_KEY
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error cancelling order ${orderId}: ${error}`);
    }
}
async function main(){
    try {
        //const orders = await fetchOpenOrders('ETHUSDC');
        const orders = await fetchOpenOrders('BTCUSDC');
        if(orders.length==0) {
            console.log(`No orders to cancel.`)
            return;
        }

        console.log(`Cancelling orders: ${orders}`);
        
        orders.forEach(order => {
            cancelOrder(order.symbol, order.orderId).then(response => {
                console.log(`Cancelled order ${order.orderId}:`, response);
            });
        });
    } catch (error) {    
        console.error(`Error cancelling orders: ${error}`);
    }
}

main();