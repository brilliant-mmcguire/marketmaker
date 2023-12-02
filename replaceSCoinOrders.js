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

const symbol = 'USDCUSDT';
const qty = 12.0;
const sellPrcFloor = parseFloat('0.9998');
const buyPrcCeiling = parseFloat('0.9995');

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

    console.log(`Placing sell order on the offer.`);
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

    console.log(`Placing buy order on the offer.`);
    joinBid = await placeOrder(
        'BUY', 
        qty, 
        symbol, 
        bestBidPrice
    );
    console.log(`Buy order placed:`, joinBid);
}

async function main() {
    makeAnOffer();
    makeABid();
}

main();