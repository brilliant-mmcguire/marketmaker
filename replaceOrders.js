/*
Implement a sweep of a trading strategy. 
Cancel all open orders and then place new orders 
in a small grid around the current spot price. 
Here I place three buy orders below the spot price and three sell order above.
These orders are priced so that they are within the expected hourly highs and lows.
Order quatity is caclulated to trade in lots of $12.
*/
const { cancelOrder } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchOpenOrders } = require('./orderTxns');
const { fetchLastPrice } = require('./marketDataTxns');

function getOrderParameters(currentPrice) {
    return {
        quantity : (Math.round((12.0 / currentPrice) * 10000)) / 10000,
        sell : [
            Math.round((currentPrice * 1.0130) * 100) / 100,
            Math.round((currentPrice * 1.0090) * 100) / 100,
            Math.round((currentPrice * 1.0060) * 100) / 100,
            Math.round((currentPrice * 1.0040) * 100) / 100,
            Math.round((currentPrice * 1.0025) * 100) / 100
        ],
        buy : [
            Math.round((currentPrice * 0.9860) * 100) / 100,
            Math.round((currentPrice * 0.9900) * 100) / 100,
            Math.round((currentPrice * 0.9930) * 100) / 100,
            Math.round((currentPrice * 0.9950) * 100) / 100,
            Math.round((currentPrice * 0.9965) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol) {
    const spot = await fetchLastPrice(symbol);
    const params = getOrderParameters(spot.price);
    const dt = new Date();
    console.log(`${symbol} current price ${spot.price} order quantity ${params.quantity} at ${dt}`);
    console.log(`Placing limit orders ${params.buy} < ${spot.price} > ${params.sell}`);
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
exports.cancelOpenOrders = cancelOpenOrders;
async function cancelOpenOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    if(orders.length==0) {
        console.log(`No orders to cancel.`);
        return;
    }
    
    console.log(`Cancelling orders: ${orders}`);
    orders.forEach(order => {
        cancelOrder(order.symbol, order.orderId).then(response => {
            console.log(`Cancelled order ${order.orderId}:`, response);
        });
    });    
}  
async function main() {
    const symbol = process.argv[2];
    if(!symbol) {
        console.log('Symbol not provided.'); 
        return; 
    }
    try {
        await cancelOpenOrders(symbol);
        await placeNewOrders(symbol);    
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}

main();