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
const { fetchAvgPrice } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');
const { fetchKLines } = require('./marketDataTxns');

/*
bps
    buy  : [-35, -45, -60, -80, -100, -125, -150] 
    sell : [+25, +35, +50, +70,  +90, +115, +140] 

function priceLevel(spot,bps){
    const scalar = 1+ (bps /10000); 
    const orderPrice = spot * scalar;
    return Math.round((orderPrice) * 100) / 100;
}
*/

function getOrderParameters(currentPrice, kLine) {
    const sellBasePrc = 0.5*(kLine.high+kLine.close);
    const buyBasePrice = 0.5*(kLine.low+kLine.close);
    return {
        quantity : (Math.round((15.0 / currentPrice) * 10000)) / 10000,
        sell : [
            Math.round((sellBasePrc * 1.0180) * 100) / 100,
            Math.round((sellBasePrc * 1.0160) * 100) / 100,
            Math.round((sellBasePrc * 1.0140) * 100) / 100,
            Math.round((sellBasePrc * 1.0120) * 100) / 100,
            Math.round((sellBasePrc * 1.0100) * 100) / 100,
            Math.round((sellBasePrc * 1.0080) * 100) / 100,
            Math.round((sellBasePrc * 1.0060) * 100) / 100,
            Math.round((sellBasePrc * 1.0040) * 100) / 100,
            Math.round((sellBasePrc * 1.0020) * 100) / 100
        ],
        buy : [
            Math.round((buyBasePrice * 0.9800) * 100) / 100,
            Math.round((buyBasePrice * 0.9820) * 100) / 100,
            Math.round((buyBasePrice * 0.9840) * 100) / 100,
            Math.round((buyBasePrice * 0.9860) * 100) / 100,
            Math.round((buyBasePrice * 0.9880) * 100) / 100,
            Math.round((buyBasePrice * 0.9900) * 100) / 100,
            Math.round((buyBasePrice * 0.9920) * 100) / 100,
            Math.round((buyBasePrice * 0.9940) * 100) / 100,
            Math.round((buyBasePrice * 0.9960) * 100) / 100, 
            Math.round((buyBasePrice * 0.9980) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol) {
    const spot = await fetchAvgPrice(symbol);
    const kLines = await fetchKLines(symbol, '4h', 1);
    const params = getOrderParameters(spot.price, kLines[0]);
    const dt = new Date();
    console.log(`${symbol} current price ${spot.price} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    //console.log(`Placing limit orders ${params.buy} < ${spot.price} > ${params.sell}`);
    console.log(`Place orders at:`, params);
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
    if(!symbol) throw 'Symbol not provided.'; 
    try {
        await cancelOpenOrders(symbol);
        await fetchPositions(symbol);
        await placeNewOrders(symbol);    
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}
if (require.main === module) main();