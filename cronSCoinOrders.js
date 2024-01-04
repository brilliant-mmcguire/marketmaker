const cron = require('node-cron');
const { placeSCoinOrders } = require('./replaceSCoinOrders');
const { cancelStaleOrders } = require('./replaceOrders');

console.log("Starting cron: placing StableCoin orders for USDCUSCT."); 

const jobCancelOrders = cron.schedule('13 * * * *', async () => {
    console.log('Invoking task at ' + new Date().toLocaleString());
    try {
        await cancelStaleOrders('USDCUSDT');   
    } catch (error) {    
        console.error(`Error placing orders: ${error}`);
    }
});
jobCancelOrders.now();

// Schedule the task to run every hour at 13 minutes past the hour.
const job = cron.schedule('*/5 * * * *', async () => {
    console.log('Invoking place orders at ' + new Date().toLocaleString());
    try {
        await placeSCoinOrders();   
    } catch (error) {    
        console.error(`Error placing orders: ${error}`);
    }
});
job.now(); // For immediate feedback when run from the console.

