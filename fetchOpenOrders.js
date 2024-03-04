/*
We need a list of open orders for a given symbol to obtain an order id 
so as to cancel these orders.  
We may also need to check our open orders to make trading decisions. 
*/

const { fetchOpenOrders } = require('./orderTxns');
async function fetchAndLogOrders(symbol) {
    const orders = await fetchOpenOrders(symbol);
    
    console.log(`${orders.length} open orders for ${symbol} at `, new Date());
    const totalQuantities = calculateTotalQuantity(orders);
    console.log(totalQuantities);
}

function calculateTotalQuantity(orders) {
    let buyQty = 0;
    let sellQty = 0;
    let buyCost = 0;
    let sellCost = 0;
    let buyCount = 0;
    let sellCount = 0;
    let buyOrders = [];
    let sellOrders = [];

    orders.forEach(order => {
      if (order.side === 'BUY') {
        buyCount++;
        buyQty += parseFloat(order.origQty);
        buyCost += parseFloat(order.origQty)*parseFloat(order.price);
        buyOrders.push(parseFloat(order.origQty) + " @ " + parseFloat(order.price));

      } else if (order.side === 'SELL') {
        sellCount++;
        sellQty += parseFloat(order.origQty);
        sellCost += parseFloat(order.origQty)*parseFloat(order.price)    
        sellOrders.push(parseFloat(order.origQty) + " @ " + parseFloat(order.price));
      }
    });

    buyCost = Math.round(1000*buyCost)/1000;
    sellCost = Math.round(1000*sellCost)/1000;
    
    return {
      buys  : { count: buyCount,  qty: buyQty,  cost: buyCost,  orders : buyOrders }, 
      sells : { count: sellCount, qty: sellQty, cost: sellCost,  orders : sellOrders }
    };
  }

async function main(){
    try {
        if (require.main !== module) return;
        const symbol = process.argv[2];
        
        if(!symbol) throw 'Symbol must be provided.'; 
    
        await fetchAndLogOrders(symbol);

    } catch (error) {    
        console.error(`Error fetching open orders: ${error}`);
    }
}

if (require.main === module) main();
