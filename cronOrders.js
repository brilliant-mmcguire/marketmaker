const cron = require('node-cron');
const { replaceOrders } = require('./replaceOrders');

const symbol = process.argv[2];
if(!symbol) throw "Symbol not provided.";

console.log(`Starting cron: replacing orders for ${symbol}`); 

// Schedule the task to run every 15 minutes past the hour.
const jobB = cron.schedule('17,37,57 * * * *', async () => {
    console.log('Invoking cron task at ' + new Date().toLocaleString());
    try {
       await replaceOrders(symbol);
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
});
jobB.now(); // For immediate feedback when run from the console.