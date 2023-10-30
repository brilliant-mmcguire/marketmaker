/*
Place orders in a small grid around the current spot price. 
Here, we place three buy orders below the spot price and three sell orders above.
These orders are priced so that they are within the expected hourly highs and lows.
Order quatity is calculated so that the order consideration is $12.
*/
const axios = require('axios');
const crypto = require('crypto');
const { placeOrder } = require('./orderTxns');

const BASE_URL = 'https://api.binance.com';
const PRICE_ENDPOINT = '/api/v3/ticker/price'

async function fetchLastPrice(symbol) {
    const { data } = await axios.get(`${BASE_URL}${PRICE_ENDPOINT}`, {
        params: { symbol: `${symbol}` }
    });
    return parseFloat(data.price);
}
function getOrderParameters(currentPrice) {
    return {
        quantity : (Math.round((12.0 / currentPrice) * 10000)) / 10000,
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
            params.buy[i]
        );
        console.log('Order placed:', buyOrder);
    }
    for (i = 0; i < params.sell.length; i++) {
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
    const symbol = process.argv[2];
    if(!symbol) {
        console.log('Symbol not provided.'); 
        return; 
    }

    console.log(`Placing orders for ${symbol}`)
    try{
       await placeOrders(symbol);   
    } catch (error) {
        console.error(`Error placing order: ${error}`);
    }
}
main();
