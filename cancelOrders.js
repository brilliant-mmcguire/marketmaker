/*
We can cancel orders for a given symbol to clear them out before placing new orders.
https://binance-docs.github.io/apidocs/spot/en/#cancel-order-trade
*/
const { cancelOrder } = require('./orderTxns');
const { fetchOpenOrders } = require('./orderTxns');
async function main(){
    try {
        //const orders = await fetchOpenOrders('ETHUSDC');
        const orders = await fetchOpenOrders('BTCUSDC');
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
    } catch (error) {    
        console.error(`Error cancelling orders: ${error}`);
    }
}

main();