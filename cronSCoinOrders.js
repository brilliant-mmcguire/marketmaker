const cron = require('node-cron');
const { placeSCoinOrders } = require('./replaceSCoinOrders');
const { placeFDUSDOrders } = require('./replaceFDUSDOrders');

console.log("Starting cron: placing StableCoin orders for USDCUSCT."); 

// Schedule the task to run every 1 minute.
const job = cron.schedule('*/1 * * * *', async () => {
    console.log('Invoking place orders at ' + new Date().toLocaleString());
    try {
        await placeSCoinOrders();  
        await placeFDUSDOrders();
    } catch (error) {    
        console.error(`Error placing orders: ${error}`);
    }
});
job.now(); // For immediate feedback when run from the console.

