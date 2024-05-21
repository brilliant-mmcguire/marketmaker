/*
We need a list of open orders for a given symbol to obtain an order id 
so as to cancel these orders.  
We may also need to check our open orders to make trading decisions. 
*/

const { fetchOpenOrders } = require('./orderTxns');
async function fetchAndLogOrders(symbol, orders) {
    console.log(`${orders.length} open orders for ${symbol} at `, new Date());
    const totalQuantities = calculateTotalQuantity(orders);
    console.log(totalQuantities);
}

function calcuateAge(order) {
   const ageMilliseconds = (Date.now() - order.time);
   return formatTimeInterval(ageMilliseconds);
}

function formatTimeInterval(milliseconds) {
  const seconds = milliseconds/1000;
  const hours = Math.floor(seconds / (3600));
  const minutes = Math.floor((seconds % (3600)) / 60);

  // Pad hours and minutes with leading zeros if necessary
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return `${formattedHours}:${formattedMinutes}`;
}

function calculateTotalQuantity(orders) {
    let buyQty = 0;
    let sellQty = 0;
    let buyCost = 0;
    let sellCost = 0;
    let buyCount = 0;
    let sellCount = 0;
    let buyCumAge = 0;
    let sellCumAge = 0;
    let buyOrders = [];
    let sellOrders = [];

    orders.forEach(order => {
     
      if (order.side === 'BUY') {
        buyCount++;
        buyQty += parseFloat(order.origQty);
        buyCost += parseFloat(order.origQty)*parseFloat(order.price);
        buyCumAge += (Date.now() - order.time)* parseFloat(order.origQty);
        buyOrders.push(calcuateAge(order) + ": " + parseFloat(order.origQty) + " @ " + parseFloat(order.price).toFixed(4));

      } else if (order.side === 'SELL') {
        sellCount++;
        sellQty += parseFloat(order.origQty);
        sellCost += parseFloat(order.origQty)*parseFloat(order.price)    
        sellCumAge += (Date.now() - order.time)* parseFloat(order.origQty);
        sellOrders.push(calcuateAge(order) + ": " + parseFloat(order.origQty) + " @ " + parseFloat(order.price).toFixed(4));
      }
    });

    buyCost = Math.round(1000*buyCost)/1000;
    sellCost = Math.round(1000*sellCost)/1000;

    let buyAge = formatTimeInterval(buyCumAge / buyQty);
    let sellAge = formatTimeInterval(sellCumAge / sellQty);

    return {
      buys  : { count: buyCount,  qty: buyQty,  cost: buyCost, age: buyAge,  orders : buyOrders }, 
      sells : { count: sellCount, qty: sellQty, cost: sellCost, age: sellAge,  orders : sellOrders }
    };
  }

async function main(){
    try {
        if (require.main !== module) return;
        const symbol = process.argv[2];
        
        if(!symbol) throw 'Symbol must be provided.'; 
    
        const orders = await fetchOpenOrders(symbol);
        await fetchAndLogOrders(symbol, orders);

       // console.log(orders);

    } catch (error) {    
        console.error(`Error fetching open orders: ${error}`);
    }
}

if (require.main === module) main();
