const cron = require('node-cron');
const { cancelOpenOrders } = require('./replaceOrders');
const { placeNewOrders } = require('./replaceOrders');

// Schedule the task to run every second
console.log('Placing orders for it');
//const jobA = cron.schedule('* * * * *', () => {
//    console.log('Every minute: ' + new Date().toLocaleString() );
//});
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