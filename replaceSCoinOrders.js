/*
Refresh orders for USDCUSDT trading pair.
Min sell price : 0.9998 
Max buy price  : 0.9995 

The objective is to keep a certain number of orders on the bid and offer, 
within the min-max bounds.

Let's say we keep 3 orders active at each price level.  
Don't want to cancel orders becase we'd lose our position in the order book. 

Step one: sell orders only. 
Get current offer price.
Get open orders. 
If number or orders at the best bid < 3 then add and order at the offer. 
*/

const { fetchOpenOrders, cancelOrder } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchPriceDepth } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');
const { cancelOrders } = require('./orderTxns');
const { fetchAccountInfo } = require('./accountTxns');

const symbol = 'USDCUSDT';
const qty = 15.0;
const sellPrcFloor  = parseFloat('0.9990');  // hard limits, just in case prices run away.
const buyPrcCeiling = parseFloat('1.0010');
//const shortPosn = -100; 
//const longPosn = 100;
//const overSoldThreshold  = -260;
//const overBoughtTreshold = +260;
const maxBuyOrderLimit = 3; // at given price level
const maxSellOrderLimit = 3;

const threshold = { 
    short : 300, 
    long : 400,
    overSold : 200, 
    overbought : 500 
};

const qtyQuantum = 400000;  // Units of order book quantity on offer at  a price level. 
                             // Place orders in multiples of quanta. 
                             // max number of orders = (qty/quantum) OR 
                             // order qty = round (12*(qty/quantum))

async function makeBids(bestBidPrices, allOrders, position, balances) {
    
    console.log(`Making bids for ${symbol} at ${new Date()}`);

    let usdcTotal = balances.usdc.total;

    let x = buyPrcCeiling; 
    if(usdcTotal > threshold.overBought) {
    //if(position.qty > overBoughtTreshold) {
        console.log(`Overbought at an avg cost price of ${position.avgPrice}`);
        // We can be more demading on price.
        x = position.avgPrice - 0.0003;
    } else if(usdcTotal > threshold.long) {
    //} else if(position.qty > longPosn) {
        console.log(`Long posn at an avg cost price of ${position.avgPrice}`);
        // Avoid buying unless we can improve our average price.
        x = position.avgPrice - 0.0001;
    }

    if(usdcTotal < threshold.overSold) {
    // if(position.qty < overSoldThreshold) {
        console.log(`Over sold at an average price of ${position.avgPrice}`);
        // We may need to buy at a loss as we are severely over-sold and running out of USDC.
        x = position.avgPrice + 0.0002; 
    } else if(usdcTotal < threshold.short) {
    //} else if(position.qty < shortPosn) {
        console.log(`Short posn at an average price of ${position.avgPrice}`);
        // Avoid buying back at a loss. 
        x = position.avgPrice; 
    }
    
    let floor = bestBidPrices[1].price - 0.0001;
    
    console.log(`Buy price ceiling: ${x} and floor: ${floor}`);
    
    //cancel any open orders exceeding the price ceiling and fallen under the price floor. 
    let staleOrders = allOrders.filter(order => ((parseFloat(order.price)>x) || (parseFloat(order.price)<floor)));
    if(staleOrders.length>0) {
         console.log(`Cancel orders above price ceiling`);
         await cancelOrders(staleOrders);
    }
    
    for(let i = 0; i< 1 /*bestBidPrices.length*/; i++) {
        let bid = bestBidPrices[i];
        let maxOrders = Math.min(maxBuyOrderLimit,bid.qty / qtyQuantum); 

        if(bid.price>x || maxOrders < 1) {
            console.log(`Ignoring price level ${bid.price} - ${bid.qty}`);
        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
            console.log(`We have ${orders.length} orders on price level ${bid.price}, maxOrders ${maxOrders}`);
            if(orders.length <= maxOrders) {
                console.log(`Placing buy order at price level ${bid.price}.`);
                try {
                    joinBid = await placeOrder(
                        'BUY', 
                        qty, 
                        symbol, 
                        bid.price
                    );
                    console.log(`Buy order placed:`, joinBid);   
                } catch (error) {
                    console.error(error.message);
                }
            } else {
              //  TO-DO: Cancel surplus orers at active price level. 
              //  const useByTime = Date.now() - (1 * 60 * 60 * 1000); // Current time minus x hours
              //  await cancelOrders(orders.filter(o => o.time < useByTime ))
            }
        }  
    };
}

async function makeOffers(bestOffers, allOrders, position, balances) {

    console.log(`Making offers for ${symbol}  at ${new Date()}`);

    let usdcTotal = balances.usdc.total;

    let x = sellPrcFloor; 
    //if(position.qty < overSoldThreshold) {
    if(usdcTotal < threshold.overSold) {
        console.log(`Oversold at an avg cost price of ${position.avgPrice}`);
        // We can be more demading on price.
        x = position.avgPrice + 0.0003;
    //} else if(position.qty < shortPosn) {
    } else if(usdcTotal < threshold.short) {
        console.log(`Short posn at an avg cost price of ${position.avgPrice}`);
        // Avoid selling unless we can improve our average price.
        x = position.avgPrice + 0.0001;
    }
    //if(position.qty > overBoughtTreshold) {
    if(usdcTotal > threshold.overBought) {
        console.log(`Over bought at an average price of ${position.avgPrice}`);
        // We may need to sell at a loss as we are severely over-bought and running out of USDT.
        x = position.avgPrice - 0.0002; 
    //} else if(position.qty > longPosn) {
    } else if(usdcTotal > threshold.long) {
        console.log(`Long posn at an average price of ${position.avgPrice}`);
        // Avoid selling back at a loss. 
        x = position.avgPrice; 
    }

    let ceiling = bestOffers[1].price + 0.0001;
    console.log(`Sell price floor: ${x} and ceiling: ${ceiling}`)
    
    //cancel any open orders exceeding the price ceiling or fallen under the price floor. 
    let staleOrders = allOrders.filter(order => ((parseFloat(order.price)<x) || (parseFloat(order.price)>ceiling)));
    
    if(staleOrders.length>0) {
         console.log(`Cancel orders below price floor`);
         await cancelOrders(staleOrders);
    }    
    
    for(let i = 0; i< 1 /*bestOffers.length*/; i++) {
        let offer = bestOffers[i];
        let maxOrders = Math.min(maxSellOrderLimit,offer.qty / qtyQuantum); 
       
        if(offer.price < x || maxOrders < 1) {
            console.log(`Ignoring price level ${offer.price} - ${offer.qty}`);

        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
            console.log(`We have ${orders.length} orders on price level ${offer.price}, maxOrders ${maxOrders}`);
            if(orders.length <= maxOrders) {
                console.log(`Placing sell order at price level ${offer.price}.`);
                try {
                    joinOffer = await placeOrder(
                        'SELL', 
                        qty, 
                        symbol, 
                        offer.price
                    );
                    console.log(`Sell order placed:`, joinOffer);   
                } catch (error) {
                    console.error(error.message);
                }
            } else {  // trim back stale orders at this level. 
                //  TO-DO: Cancel surplus orers at active price level. 
                //const useByTime = Date.now() - (1 * 60 * 60 * 1000); // Current time minus x hours
                //await cancelOrders(orders.filter(o => o.time < useByTime ))
            }
        }  
    };
}


exports.placeSCoinOrders = placeSCoinOrders;
async function placeSCoinOrders() {
   try {
    console.log("Fetching best offer prices.");
    const prcDepth = await fetchPriceDepth(symbol);

    const noneZeroBalances =  await fetchAccountInfo();
    let balances = {
       usdc : noneZeroBalances.balances.filter(balance => (balance.asset=='USDC'))[0],
       usdt : noneZeroBalances.balances.filter(balance => (balance.asset=='USDT'))[0]
    }
    
     console.log("Fetching open orders and position");
     const allOrders = await fetchOpenOrders(symbol);
     const position = await fetchPositions(symbol);

     makeBids(
        prcDepth.bids, 
        allOrders.filter(order => (order.side==='BUY')), 
        position, 
        balances);
     makeOffers(
        prcDepth.asks, 
        allOrders.filter(order => (order.side==='SELL')), 
        position,
        balances); 
   } catch (error) {
     console.error(error.message);
   }
}

if (require.main === module) placeSCoinOrders();
