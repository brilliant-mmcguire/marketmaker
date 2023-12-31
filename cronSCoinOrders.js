const cron = require('node-cron');
const { placeSCoinOrders } = require('./replaceSCoinOrders');
const { cancelStaleOrders } = require('./orderTxns');

console.log("Starting cron: placing StableCoin orders for USDCUSCT."); 

// Schedule the task to run every hour at 13 minutes past the hour.
const job = cron.schedule('*/5 * * * *', async () => {
    console.log('Invoking place orders at ' + new Date().toLocaleString());
    try {
        await cancelStaleOrders('USDCUSDT');  
        await placeSCoinOrders();   
    } catch (error) {    
        console.error(`Error placing orders: ${error}`);
    }
});
job.now(); // For immediate feedback when run from the console.

