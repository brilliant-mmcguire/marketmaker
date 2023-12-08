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

const symbol = 'USDCUSDT';
const qty = 16.0;
const sellPrcFloor = parseFloat('0.9998');
const buyPrcCeiling = parseFloat('1.0002');
const maxBidsForPrice = 6;
const maxOffersForPrice = 6;

const qtyQuantum = 5000;  // Units of order book quantity on offer at  a price level. 
                          // Place orders in multiples of quanta. 
                          // number of orders = 12*(qty/quantum)

async function makeBids(bestBidPrices, allOrders) {
 
    console.log(`Making bids for ${symbol} at ${new Date()}`);
    
    for(let i = 0; i< bestBidPrices.length; i++) {
        let bid = bestBidPrices[i];
        if(bid.price>buyPrcCeiling || bid.qty < qtyQuantum) {
            console.log(`Ignoring price level ${bid.price}`);
        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
            console.log(`We have ${orders.length} orders on price level ${bid.price}.`);
            if(orders.length <= maxBidsForPrice) {
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

async function makeOffers(bestOffers, allOrders) {
 
    console.log(`Making offers for ${symbol}  at ${new Date()}`);
    
    for(let i = 0; i< bestOffers.length; i++) {
        let offer = bestOffers[i];
        if(offer.price<sellPrcFloor || offer.qty < qtyQuantum) {
            console.log(`Ignoring price level ${offer.price}`);
        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
            console.log(`We have ${orders.length} orders on price level ${offer.price}.`);
            if(orders.length <= maxOffersForPrice) {
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
     makeBids(prcDepth.bids, allOrders);
     makeOffers(prcDepth.asks, allOrders); 
   } catch (error) {
     console.error(error.message);
   }
}

if (require.main === module) placeSCoinOrders();
