const cron = require('node-cron');

// Schedule the task to run every second
console.log('Placing orders for it');
//const jobA = cron.schedule('* * * * *', () => {
//    console.log('Every minute: ' + new Date().toLocaleString() );
//});
const jobB = cron.schedule('0 * * * *', () => {
    console.log('Every hour: ' + new Date().toLocaleString());
});
jobB.now();