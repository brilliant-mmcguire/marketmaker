/*
We can cancel orders for a given symbol to clear them out before placing new orders.
*/
const { cancelOrder } = require('./orderTxns');
const { cancelStaleOrders } = require('./orderTxns');
const { cancelOpenOrders } = require('./orderTxns');
const { fetchOpenOrders } = require('./orderTxns');

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
async function main(){
    const symbol = process.argv[2];
    if(!symbol) {
        console.log('Symbol not provided.'); 
        return; 
    }
    try {
        cancelOpenOrders(symbol);
    } catch (error) {    
        console.error(`Error cancelling orders: ${error}`);
    }
}

main();