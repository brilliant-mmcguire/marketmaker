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
exports.cancelOrder = cancelOrder;
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
exports.placeOrder = placeOrder;
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
exports.fetchOpenOrders = fetchOpenOrders;
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
        symbol: d.symbol,
        side: d.side,
        orderId: d.orderId,
        time: d.time,
        origQty: d.origQty,
        price: d.price
    }));
}

exports.cancelOpenOrders = cancelOpenOrders;
async function cancelOpenOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    if(orders.length==0) {
        console.log(`No orders to cancel.`);
        return;
    }
    console.log(`Cancelling ${orders.length} orders.`);
    orders.forEach(order => {
        cancelOrder(order.symbol, order.orderId).then(response => {
            console.log(`Cancelled order ${order.orderId}`);
        });
    });    
} 

exports.cancelStaleOrders = cancelStaleOrders;
async function cancelStaleOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    const useByTime = Date.now() - (2 * 60 * 60 * 1000); // Current time minus x hours
    const oldOrders = orders.filter(order => order.time < useByTime);
    
    if(oldOrders.length==0) {
        console.log(`No orders to cancel.`);
        return;
    }
    console.log(`Cancelling ${oldOrders.length} old orders.`);
    oldOrders.forEach(order => {
        cancelOrder(order.symbol, order.orderId).then(response => {
            console.log(`Cancelled order ${order.orderId}`);
        });
    });
}

exports.cancelOrders = cancelOrders;
async function cancelOrders(orders) {
    console.log(`Cancelling ${orders.length} orders.`);
    orders.forEach(order => {
        cancelOrder(order.symbol, order.orderId).then(response => {
            console.log(`Cancelled order ${order.orderId}`);
        });
    });  
}