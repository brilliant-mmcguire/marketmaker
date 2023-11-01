const cron = require('node-cron');
const { cancelOpenOrders } = require('./replaceOrders');
const { placeNewOrders } = require('./replaceOrders');

// Schedule the task to run every hour.
const jobB = cron.schedule('0 * * * *', async () => {
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