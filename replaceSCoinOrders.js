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
const { fetchBestOfferPrice } = require('./marketDataTxns');
const { fetchBestBidPrice } = require('./marketDataTxns');
const { fetchPriceDepth } = require('./marketDataTxns');

const symbol = 'USDCUSDT';
const qty = 12.0;
const sellPrcFloor = parseFloat('0.9998');
const buyPrcCeiling = parseFloat('0.9998');

async function makeAnOffer() {
    console.log("Fetching best offer price.");
    const bestOfferPrice = await fetchBestOfferPrice(symbol);
    console.log(`Best offer price: ${bestOfferPrice}`);

    if(bestOfferPrice<sellPrcFloor) {
        console.log("Noting to do here.");
        return;
    }

    console.log("Fetching open orders");
    const allOrders = await fetchOpenOrders(symbol);
    const orders = allOrders.filter(order => parseFloat(order.price) === bestOfferPrice );
    console.log(`We have ${orders.length} order on the offer.`);

    if(orders.length>=3) {
        console.log("We already have 3+ orders on the offer. Do nothing.");
        return;
    }

    console.log(`Placing sell order at ${bestOfferPrice}.`);
    joinOffer = await placeOrder(
        'SELL', 
        qty, 
        symbol, 
        bestOfferPrice
    );
    console.log(`Order placed:`, joinOffer);
}


async function makeABid() {
    console.log("Fetching best offer price.");
    const bestBidPrice = await fetchBestBidPrice(symbol);
    console.log(`Best bid price: ${bestBidPrice}`);

    if(bestBidPrice>buyPrcCeiling) {
        console.log("Noting to do here.");
        return;
    }

    console.log("Fetching open orders");
    const allOrders = await fetchOpenOrders(symbol);
    const orders = allOrders.filter(order => parseFloat(order.price) === bestBidPrice );
    console.log(`We have ${orders.length} order on the bid.`);

    if(orders.length>=3) {
        console.log("We already have 3+ orders on the bid. Do nothing.");
        return;
    }

    console.log(`Placing buy order at ${bestBidPrice}.`);
    joinBid = await placeOrder(
        'BUY', 
        qty, 
        symbol, 
        bestBidPrice
    );
    console.log(`Buy order placed:`, joinBid);
}

async function makeBids(bestBidPrices, allOrders) {
 
    console.log(`Making bids for ${symbol}`);
    
    for(let i = 0; i< bestBidPrices.length; i++) {
        let bid = bestBidPrices[i];
        if(bid.price>buyPrcCeiling) {
            console.log(`Ignoring price level ${bid.price}`);
        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === bid.price ); 
            console.log(`We have ${orders.length} orders on price level ${bid.price}.`);
            if(orders.length<=3) {
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
 
    console.log(`Making offers for ${symbol}`);
    
    for(let i = 0; i< bestOffers.length; i++) {
        let offer = bestOffers[i];
        if(offer.price<sellPrcFloor) {
            console.log(`Ignoring price level ${offer.price}`);
        } else {
            let orders = allOrders.filter(order => parseFloat(order.price) === offer.price ); 
            console.log(`We have ${orders.length} orders on price level ${offer.price}.`);
            if(orders.length<=3) {
                console.log(`Placing buy order at price level ${offer.price}.`);
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
   // makeAnOffer();
   // makeABid();

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
