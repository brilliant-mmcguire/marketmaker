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

const { fetchOpenOrders } = require('./orderTxns');
const { placeOrder } = require('./orderTxns');
const { fetchPriceDepth } = require('./marketDataTxns');
const { fetchPositions } = require('./fetchTrades');

const symbol = 'USDCUSDT';
const qty = 14.0;
const sellPrcFloor  = parseFloat('0.9995');  // hard limits, just in case prices run away.
const buyPrcCeiling = parseFloat('1.0005');
const overSoldThreshold = -200;
const overBoughtTreshold = +200;

const qtyQuantum = 1200000;  // Units of order book quantity on offer at  a price level. 
                             // Place orders in multiples of quanta. 
                             // max number of orders = (qty/quantum) OR 
                             // order qty = round (12*(qty/quantum))

async function makeBids(bestBidPrices, allOrders, position) {
    
    console.log(`Making bids for ${symbol} at ${new Date()}`);
   
    let x = buyPrcCeiling; 

    if(position.qty>overBoughtTreshold) {
        console.log(`Over bought at an average price of ${position.avgPrice}`);
        // Avoid buying unless we can improve our average price.
        x = position.avgPrice - 0.0001;
    }

    if(position.qty < overSoldThreshold) {
        console.log(`Over sold at an average price of ${position.avgPrice}`);
        // Avoid selling at a loss.
        x = position.avgPrice; 
    }
    
    for(let i = 0; i< bestBidPrices.length; i++) {
        let bid = bestBidPrices[i];
        let maxOrders = bid.qty / qtyQuantum; 

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
            }
        }  
    };
}

async function makeOffers(bestOffers, allOrders, position) {
 
    console.log(`Making offers for ${symbol}  at ${new Date()}`);
    //console.log(position);
    let x = sellPrcFloor; 

    if(position.qty < overSoldThreshold) {
        console.log(`Over sold at an average price of ${position.avgPrice}`);
        // Avoid selling unless we can improve on our average price.
        x = position.avgPrice + 0.0001; 
    }

    if(position.qty > overBoughtTreshold) {
        console.log(`Overbought at average price of ${position.avgPrice}`)
        // avoild selling at less than the average price at which we have bought.
        x = position.avgPrice;
    }

    for(let i = 0; i< bestOffers.length; i++) {
        let offer = bestOffers[i];
        let maxOrders = offer.qty / qtyQuantum; 

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
            }
        }  
    };
}

exports.placeSCoinOrders = placeSCoinOrders;
async function placeSCoinOrders() {

   console.log("Fetching best offer prices.");
   const prcDepth = await fetchPriceDepth(symbol);

   console.log("Fetching open orders");
   try {
     const allOrders = await fetchOpenOrders(symbol);
     const position = await fetchPositions(symbol);
     makeBids(prcDepth.bids, allOrders, position);
     makeOffers(prcDepth.asks, allOrders, position); 
   } catch (error) {
     console.error(error.message);
   }
}

if (require.main === module) placeSCoinOrders();
