/*
We need a list of open orders for a given symbol to obtain an order id 
so as to cancel these orders. 
We may also need to check our open orders to make trading decisions. 

https://binance-docs.github.io/apidocs/spot/en/#current-open-orders-user_data
*/

const { fetchOpenOrders } = require('./orderTxns');

async function fetchAndLogOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    console.log(`${orders.length} open orders for ${symbol} at `, new Date());
    console.log(orders);
}

async function main(){
    try {
        await fetchAndLogOrders('ETHUSDC');
        await fetchAndLogOrders('BTCUSDC');
    } catch (error) {    
        console.error(`Error cancelling orders: ${error}`);
    }
}
main();
