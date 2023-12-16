const cron = require('node-cron');
const { cancelOpenOrders } = require('./replaceOrders');
const { placeNewOrders } = require('./replaceOrders');
const { fetchPositions } = require('./fetchTrades');

const symbol = process.argv[2];
if(!symbol) throw "Symbol not provided.";

console.log("Starting cron: replacing orders for ${symbol}"); 

// Schedule the task to run every hour at 13 minutes past the hour.
const jobB = cron.schedule('47 */1 * * *', async () => {
    console.log('Invoking hourly task at ' + new Date().toLocaleString());
    try {
        await cancelOpenOrders(symbol);
        const position = await fetchPositions(symbol);
        await placeNewOrders(symbol, position);   
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
});
jobB.now(); // For immediate feedback when run from the console.