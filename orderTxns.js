const cfg = require('dotenv').config();
const axios = require("axios");
const crypto = require("crypto");

const BASE_URL = 'https://api.binance.com';
const ORDER_ENDPOINT = '/api/v3/order';
const TEST_ENDPOINT = '/api/v3/order/test';

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

function createSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

/*
Cancel an order for a given order ID.
https://binance-docs.github.io/apidocs/spot/en/#cancel-order-trade
*/
async function cancelOrder(symbol, orderId) {
    const timestamp = Date.now();
    const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    const url = `${BASE_URL}${ORDER_ENDPOINT}?${query}&signature=${signature}`;

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

/* 
Place a new order for the specified parameters.
https://binance-docs.github.io/apidocs/spot/en/#new-order-trade
*/
async function placeOrder(side, quantity, symbol, price, test=false) {
    const timestamp = Date.now();
    const query = `symbol=${symbol}&side=${side}&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price.toFixed(4)}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    ep = test ? TEST_ENDPOINT: ORDER_ENDPOINT; 
    const url = `${BASE_URL}${ep}?${query}&signature=${signature}`;
    const response = await axios({
        method: 'POST',
        url: url,
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data;
}

/*
Fetch all open orders for a given symbol.
https://binance-docs.github.io/apidocs/spot/en/#current-open-orders-user_data
*/
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
        time: d.time,
        side: d.side,
        origQty: d.origQty,
        symbol: d.symbol,
        price: d.price
    }));
}
exports.cancelOrder = cancelOrder;
exports.placeOrder = placeOrder;
exports.fetchOpenOrders = fetchOpenOrders;
