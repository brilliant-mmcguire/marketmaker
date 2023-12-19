/*
Implement a sweep of a trading strategy. 
Cancel all open orders and then place new orders 
in a small grid around the current spot price. 
Here I place three buy orders below the spot price and three sell order above.
These orders are priced so that they are within the expected hourly highs and lows.
Order quatity is caclulated to trade in lots of $12.
*/
const { cancelOrder } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchOpenOrders } = require('./orderTxns');
const { fetchLastPrice } = require('./marketDataTxns');
const { fetchAvgPrice } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');
const { fetchKLines } = require('./marketDataTxns');

/*
bps
    buy  : [-35, -45, -60, -80, -100, -125, -150] 
    sell : [+25, +35, +50, +70,  +90, +115, +140] 

function priceLevel(spot,bps){
    const scalar = 1+ (bps /10000); 
    const orderPrice = spot * scalar;
    return Math.round((orderPrice) * 100) / 100;
}
*/

function getOrderParameters(currentPrice, kLine) {

    // Base prices: midway between current price (close) and the high or low. 
    const sellBasePrc = 0.5*(kLine.high+kLine.close);
    const buyBasePrice = 0.5*(kLine.low+kLine.close);
    
    return {
        quantity : (Math.round((19.0 / currentPrice) * 10000)) / 10000,
        sell : [
           // Math.round((sellBasePrc * 1.0220) * 100) / 100,
           // Math.round((sellBasePrc * 1.0180) * 100) / 100,
           // Math.round((sellBasePrc * 1.0150) * 100) / 100,
           // Math.round((sellBasePrc * 1.0120) * 100) / 100,
           // Math.round((sellBasePrc * 1.0100) * 100) / 100,
           // Math.round((sellBasePrc * 1.0080) * 100) / 100,
            Math.round((sellBasePrc * 1.0070) * 100) / 100,
            Math.round((sellBasePrc * 1.0050) * 100) / 100,
            Math.round((sellBasePrc * 1.0030) * 100) / 100,
            Math.round((sellBasePrc * 1.0015) * 100) / 100,
            Math.round((sellBasePrc * 1.0005) * 100) / 100
        ],
        buy : [
         //   Math.round((buyBasePrice * 0.9780) * 100) / 100,
         //   Math.round((buyBasePrice * 0.9820) * 100) / 100,
         //   Math.round((buyBasePrice * 0.9850) * 100) / 100,
         //   Math.round((buyBasePrice * 0.9880) * 100) / 100,
         //   Math.round((buyBasePrice * 0.9900) * 100) / 100,
         //   Math.round((buyBasePrice * 0.9920) * 100) / 100,
            Math.round((buyBasePrice * 0.9930) * 100) / 100,
            Math.round((buyBasePrice * 0.9950) * 100) / 100,
            Math.round((buyBasePrice * 0.9970) * 100) / 100, 
            Math.round((buyBasePrice * 0.9985) * 100) / 100, 
            Math.round((buyBasePrice * 0.9995) * 100) / 100
        ]
    }
}
exports.placeNewOrders = placeNewOrders;
async function placeNewOrders(symbol, position) {
    const spot = await fetchAvgPrice(symbol);
    const kLines = await fetchKLines(symbol, '1h', 1);
    const params = getOrderParameters(spot.price, kLines[0]);
    const dt = new Date();
    console.log(`${symbol} current price ${spot.price} order quantity ${params.quantity} at ${dt.toLocaleString()}`);
    //console.log(`Placing limit orders ${params.buy} < ${spot.price} > ${params.sell}`);
    console.log(`Place orders at:`, params);
   
    try {  // Make bids.
        for (let i = 0; i < params.buy.length; i++) {
            if((position.cost > 250.0) && params.buy[i] >  (0.990 * position.avgPrice)) {
                console.log(
                    `overbought so avoid buying unless we are improving our avg price lot.`, 
                    params.buy[i]);
                continue;
            }
            else if((position.cost > 100.0) && params.buy[i] >  (0.999 * position.avgPrice)) {
                console.log(
                    `long position so we don't want to buy unless we are improving our avg price.`, 
                    params.buy[i]);
                continue;
            }

            if((position.cost < -250.0) && params.buy[i] > (1.002 * position.avgPrice)) {
                console.log(
                    `oversold so may need to buy back at a loss.`, 
                    params.buy[i]);
                continue;
            } else if((position.cost < -100.0) && params.buy[i] > (0.999 * position.avgPrice)) {
                console.log(
                    `short position and we do not want to buy at more than cost price.`, 
                    params.buy[i]);
                continue;
            }

            const buyOrder = await placeOrder(
                'BUY', 
                params.quantity, 
                symbol, 
                params.buy[i]
            );
            console.log('Order placed:', buyOrder);
        }
    } catch (error) {
        console.log(`Error thrown placing buy order ${error}`);
    }

    try { // Make offers.
        for (let i = 0; i < params.sell.length; i++) {

            if(position.cost < -250.0 && params.sell[i] <  (1.010 * position.avgPrice)) {
                console.log(
                    `Oversold so we don't want to sell unless we are improving our avg price a lot.` , 
                    params.sell[i]);
                continue;
            } else
            if(position.cost < -100.0 && params.sell[i] <  (1.001 * position.avgPrice)) {
                console.log(
                    `short position so we don't want to sell unless we are improving our avg price.` , 
                    params.sell[i]);
                continue;
            }

            if(position.cost > 250.0 && params.sell[i] < 0.998*position.avgPrice) {
                console.log(
                    `Overbought so we may may need to sell back at a loss.`, 
                    params.sell[i]);
                continue;
            } else
            if(position.cost > 100.0 && params.sell[i] < 1.001*position.avgPrice) {
                console.log(
                    `long position and we do not want to sell at less than cost price.`, 
                    params.sell[i]);
                continue;
            }

            const sellOrder = await placeOrder(
                'SELL', 
                params.quantity, 
                symbol, 
                params.sell[i]
            );
            console.log('Order placed:', sellOrder);
        }
    } catch (error) {
        console.log(`Error thrown placing sell order ${error}`);
    }
    return;
}
exports.cancelOpenOrders = cancelOpenOrders;
async function cancelOpenOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    if(orders.length==0) {
        console.log(`No orders to cancel.`);
        return;
    }
    console.log(`Cancelling ${orders.length} orders.`);
    orders.forEach(order => {
        cancelOrder(order.symbol, order.orderId).then(response => {
            console.log(`Cancelled order ${order.orderId}`);
        });
    });    
}  
async function main() {
    const symbol = process.argv[2];
    if(!symbol) throw 'Symbol not provided.'; 
    try {
        await cancelOpenOrders(symbol);
        const position = await fetchPositions(symbol);
        await placeNewOrders(symbol, position);    
    } catch (error) {    
        console.error(`Error replacing orders: ${error}`);
    }
}
if (require.main === module) main();