const cron = require('node-cron');
const { placeSCoinOrders } = require('./replaceSCoinOrders');
const { cancelOpenOrders } = require('./replaceOrders');

console.log("Starting cron: placing StableCoin orders for USDCUSCT."); 

const jobCancelOrders = cron.schedule('13 */3 * * *', async () => {
    console.log('Invoking task at ' + new Date().toLocaleString());
    try {
        await cancelOpenOrders('USDCUSDT');   
    } catch (error) {    
        console.error(`Error placing orders: ${error}`);
    }
});

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

