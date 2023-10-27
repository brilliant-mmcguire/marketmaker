/*
Place orders in a small grid around the current spot price. 
Here I place three buy orders below the spot price and three sell order above.
These orders are priced so that they are within the expected hourly highs and lows.
Order quatity is  
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

async function fetchLastPrice(symbol) {
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
function getOrderParameters(currentPrice) {
    return {
        quatity : (Math.round((12.0 / currentPrice) * 10000)) / 10000,
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
    const currentPrice = await fetchLastPrice(symbol);
    const params = getOrderParameters(currentPrice);

    const dt = new Date();
    console.log(`${symbol} current price ${currentPrice} order quantity ${params.quantity} at ${dt}`);
    console.log(`Placing limit orders ${params.buy} < ${currentPrice} > ${params.sell}`);

    for (i = 0; i < params.buy.length; i++) {
        const buyOrder = await placeOrder(
            'BUY', 
            params.quantity, 
            symbol, 
            params.buy[i])
        ;
        console.log('Order placed:', buyOrder);
    }
    for (i = 0; i < orderPrices.sell.length; i++) {
        const sellOrder = await placeOrder(
            'SELL', 
            params.quantity, 
            symbol, 
            params.sell[i]
        );
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
