const cron = require('node-cron');
const { cancelOpenOrders } = require('./replaceOrders');
const { placeNewOrders } = require('./replaceOrders');

const symbol = process.argv[2];
if(!symbol) throw "Symbol not provided.";

// Schedule the task to run every hour at 13 minutes past the hour.
const jobB = cron.schedule('13 * * * *', async () => {
    console.log('Invoking hourly task at ' + new Date().toLocaleString());
    symbol = 'BTCUSDC';
    try {
        await cancelOpenOrders(symbol);
        await placeNewOrders(symbol);    
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
});
jobB.now();