/*
We can cancel orders for a given symbol to clear them out before placing new orders.
*/
const { cancelOrder } = require('./orderTxns');
const { cancelOrders } = require('./orderTxns');
const { cancelOpenOrders } = require('./orderTxns');
const { fetchOpenOrders } = require('./orderTxns');

async function showStaleOrders(orders){    
    try{
        const useByTime = Date.now() - (1.5 * 60 * 60 * 1000); // Current time minus x hours
        
        const sells = orders.filter(order => order.side=='SELL' );
        const buys = orders.filter(order => order.side=='BUY' );  

        console.log(sells.filter(s => s.time < useByTime ));  
        //  cancelOrders(sells.filter(s => s.time < useByTime ));

        console.log(sells.filter(b => b.time < useByTime ));  
        //  cancelOrders(buys.filter(b => b.time < useByTime ));
    } catch (error) {    
        console.error(error.message);
    }   
}

async function main(){
    const symbol = process.argv[2];
    if(!symbol) {
        console.log('Symbol not provided.'); 
        return; 
    }
    try {
        //cancelOpenOrders(symbol);
        const orders = await fetchOpenOrders(symbol);
        showStaleOrders(orders);
        //cancelOrders(orders);
        //cancelStaleOrders(symbol);
    } catch (error) {    
        console.error(error.message);
    }
}

main();