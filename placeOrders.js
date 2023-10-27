/*
Place orders in a small grid around the current spot price. 

https://binance-docs.github.io/apidocs/spot/en/#new-order-trade
*/
const cfg = require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const { brotliDecompress } = require('zlib');

const BASE_URL = 'https://api.binance.com';
const PRICE_ENDPOINT = '/api/v3/ticker/price'
const ORDER_ENDPOINT = '/api/v3/order';
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

async function getLastPrice(symbol) {
    const { data } = await axios.get(`${BASE_URL}${PRICE_ENDPOINT}`, {
        params: { symbol: `${symbol}` }
    });
    return parseFloat(data.price);
}
async function placeOrder(side, quantity, symbol, price) {
    const timestamp = Date.now();
    const query = `symbol=${symbol}&side=${side}&type=LIMIT&timeInForce=GTC&quantity=${quantity}&price=${price.toFixed(2)}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
    const url = `${BASE_URL}${ORDER_ENDPOINT}?${query}&signature=${signature}`;

    const response = await axios({
        method: 'POST',
        url: url,
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return response.data;
}
function getOrderPrices(currentPrice) {
    return {
        sell : [
            Math.round((currentPrice * 1.004) * 100) / 100,
            Math.round((currentPrice * 1.007) * 100) / 100,
            Math.round((currentPrice * 1.011) * 100) / 100
        ],
        buy : [
            Math.round((currentPrice * 0.997) * 100) / 100,
            Math.round((currentPrice * 0.994) * 100) / 100,
            Math.round((currentPrice * 0.990) * 100) / 100
        ]
    }
}
async function placeOrders(symbol) {
    const currentPrice = await getLastPrice(symbol);
    const quantity = (Math.round((12.0 / currentPrice) * 10000)) / 10000;
    const orderPrices = getOrderPrices(currentPrice);

    const dt = new Date();
    console.log(`${symbol} current price ${currentPrice} order quantity ${quantity} at ${dt}`);
    console.log(`Placing limit orders ${orderPrices.buy} < ${currentPrice} > ${orderPrices.sell}`);

    for (i = 0; i < orderPrices.buy.length; i++) {
        const buyOrder = await placeOrder('BUY', quantity, symbol, orderPrices.buy[i]);
        console.log('Order placed:', buyOrder);
    }
    for (i = 0; i < orderPrices.sell.length; i++) {
        const sellOrder = await placeOrder('SELL', quantity, symbol, orderPrices.sell[i]);
        console.log('Order placed:', sellOrder);
    }
    return;
}
async function main() {
    try{
        //await placeOrders('ETHUSDC');  
        await placeOrders('BTCUSDC');         
    } catch (error) {
        console.error(`Error placing order: ${error}`);
    }
}
main();
