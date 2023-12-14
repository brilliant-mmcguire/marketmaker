/*
Fetch Trades to compute trading position and statistics. 

https://binance-docs.github.io/apidocs/spot/en/#account-trade-list-user_data
*/
const cfg = require('dotenv').config();
const axios = require('axios');
const { assert, Console } = require('console');
const crypto = require('crypto');
const qs = require('qs');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const BASE_URL = 'https://api.binance.com';

function createSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function fetchMyTrades(symbol, limit) {
    const endpoint = '/api/v3/myTrades';
    const ts = new Date();
    
    const params = {
        symbol: symbol,
        timestamp: Date.now(),
        limit: limit,
        // startTime : new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()-1).getTime(),
        // endTime : ts.getTime(), // endTime can't be more that 24hrs ahead of startTime.
        startTime : (new Date().getTime() - (1 * 24 * 60 * 60 * 1000))
    };
    const query = qs.stringify(params);
    const signature = createSignature(query);
    const url = `${BASE_URL}${endpoint}?${query}&signature=${signature}`;
    const response = await axios.get(url, {
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return {
        all    : response.data, 
        buys   : response.data.filter(trade => trade.isBuyer),
        sells  : response.data.filter(trade => !trade.isBuyer)
    };
}

function computePosition(trades) {
    const totalQty = trades
        .reduce((sum, trade) => sum + parseFloat(trade.qty), 0);
    const totalQuoteQty = trades
        .reduce((sum, trade) => sum + parseFloat(trade.quoteQty), 0);
    const totalValue = trades
        .reduce((sum, trade) => sum + (parseFloat(trade.qty) * parseFloat(trade.price)), 0);
    const totalCommision = trades
        .reduce((sum, trade) => sum + parseFloat(trade.commission), 0);

    return {
        tradeCount: trades.length,
        qty: totalQty,
        quoteQty: totalQuoteQty,
        consideration: totalValue,
        commission: totalCommision,
        avgPrice: totalValue / totalQty
    };
}

async function fetchPositions2(symbol) {
    try {
        const trades = await fetchMyTrades(symbol, 1000);
        const pos = {
            symbol : symbol,
            qty : 0.0,
            quoteQty : 0.0,
            avgPrice : 0.0,
            cost: 0.0,
            matchedQty : 0.0,
            realisedPL : 0.0,
            sold    : computePosition(trades.sells),
            bought  : computePosition(trades.buys)
        };

        for(let i = 0; i < trades.all.length; i++) {
            let r = trades.all[i];
            let t = {
                isBuyer : r.isBuyer, 
                qty : 0.0, quoteQty : 0.0, 
                price : parseFloat(r.price) 
            };
            if(t.isBuyer) {
                t.qty = parseFloat(r.qty); 
                t.quoteQty = parseFloat(r.quoteQty); 
            } else {
                t.qty = -1.0 * parseFloat(r.qty); 
                t.quoteQty = -1.0 * parseFloat(r.quoteQty);
            };
            


            // Trade increases position.
            let newPositionQty = pos.qty+t.qty;
            let action = ''; 
            if (Math.sign(pos.qty) == Math.sign(t.qty)) {
                action = 'increasePosition';
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;    
                pos.cost += t.qty*t.price;
                pos.avgPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
                // PL does not change.
            
            } else if(Math.sign(newPositionQty) == Math.sign(pos.qty)) {
                action = 'reducePosition'
                console.assert(Math.abs(pos.qty+t.qty) < Math.abs(pos.qty), `Expect reduced position ${pos.qty} > ${newPositionQty}`);
                
                pos.cost += t.qty * pos.avgPrice; 
                pos.realisedPL += t.qty * (pos.avgPrice - t.price); 
                pos.matchedQty += Math.abs(t.qty);
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;
                // avgPrice doesn't change.
            
            } else {
                action = `flipPosition`
                console.assert(Math.sign(newPositionQty)!= Math.sign(pos.qty), `Expect flipped position ${pos.qty} > ${newPositionQty}`);
            
                //
                // first, the closing part of the trade.
                //

                // zero out cost.
                pos.cost -= pos.qty * pos.avgPrice; 
                console.assert(pos.cost==0.0, `Zero pos.cost on flat position ${pos.cost}`); 

                pos.realisedPL -= pos.qty * (pos.avgPrice - t.price); 
                pos.matchedQty += Math.abs(pos.qty);
                
                //
                // now, the opening part of the trade.
                //
                pos.cost += (t.qty + pos.qty) * t.price;
                
                //
                // finally, the general case computations. 
                //
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;
                pos.avgPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
               
               // pos.avgPrice =  pos.cost / pos.qty;
            }

            /*
            if(t.isBuyer) {
                if(pos.qty >= 0) { // opening buy trade on long position. 
                    console.assert(t.qty>0,`t.qty is +ve ${t.qty}`);
                    pos.qty += t.qty;
                    pos.quoteQty += t.quoteQty;    
                    pos.cost += t.qty*t.price;
                    pos.avgPrice =  pos.cost / pos.qty;
                    // PL does not change.

                } else {  // closing buy trade on a short position.
                    if(Math.abs(t.qty)<=Math.abs(pos.qty)) { 

                        console.assert(pos.cost<=0, `pos.cost is -ve ${pos.cost}`);
                        console.assert(t.qty>0,`t.qty is +ve ${t.qty}`);
                        pos.cost += t.qty * pos.avgPrice; 
                        
                        // PL delta is +ve if the buy price is lower than avg cost price.
                        pos.realisedPL += t.qty * (pos.avgPrice - t.price); 
                        
                        // Matched qty increases by the quantity of the buy trade.
                        pos.matchedQty += t.qty;

                        pos.qty += t.qty;
                        pos.quoteQty += t.quoteQty;

                        // avgPrice doesn't change.

                    } else { // crosses zero position. 
                        
                        //
                        // first, the closing part of the trade.
                        //

                        // zero out cost.
                        pos.cost -= pos.qty * pos.avgPrice; 
                        console.assert(pos.qty<0    , `pos.qty is -ve ${pos.qty}}`);
                        console.assert(pos.cost==0.0, `Zero pos.cost on flat position ${pos.cost}`); 

                        // PL delta is +ve if the buy price is lower than avg cost price.
                        pos.realisedPL -= pos.qty * (pos.avgPrice - t.price); 
                        
                        // Matched qty increases by the quantity of the buy trade.
                        pos.matchedQty -= pos.qty;
                        
                        //
                        // now, the opening part of the trade.
                        //
                        pos.cost += (t.qty + pos.qty) * t.price;
                        
                        pos.qty += t.qty;
                        pos.quoteQty += t.quoteQty;
                        pos.avgPrice =  pos.cost / pos.qty;
                    }
                }
            } else {  // seller. 
                
                console.assert(t.qty<0 , `t.qty is -ve on sell trade ${t.qty}`);
                        
                if(pos.qty <= 0) { // opening sell trade on short position. 
                    pos.qty += t.qty;
                    pos.quoteQty += t.quoteQty;    
                    pos.cost += t.qty*t.price;
                    pos.avgPrice =  pos.cost / pos.qty;
                    // PL does not change.

                } else {  // closing sell trade on a long position.
                    console.assert(pos.cost>=0 , `pos.cost is +ve on long position ${pos.cost}`);
                    console.assert(pos.qty>0   , `pos.qty is +ve on long position ${pos.qty}`);

                    if(Math.abs(t.qty)<=Math.abs(pos.qty)) {  
 
                        pos.cost += t.qty * pos.avgPrice; 
                        
                        // PL delta is +ve if the sell price is lower than avg buy price.
                        pos.realisedPL += t.qty * (pos.avgPrice - t.price); 
                        
                        // Matched qty increases by the quantity of the whole sell trade.
                        pos.matchedQty -= t.qty;

                        pos.qty += t.qty;
                        pos.quoteQty += t.quoteQty;

                        // avgPrice doesn't change.

                    } else { // crosses zero position. 
                        
                        //
                        // first, the closing part of the trade.
                        //
                        
                        // zero out cost.
                        pos.cost -= pos.qty * pos.avgPrice; 
                        console.assert(pos.cost==0.0, `Zero pos.cost on flat position ${pos.cost}`); 
                        
                        // PL delta is +ve if the sell price is higher than avg cost price.
                        pos.realisedPL += pos.qty * (t.price - pos.avgPrice); 
                        
                        // Matched qty increases by the quantity of the position being closed.
                        pos.matchedQty += pos.qty;
                        
                        //
                        // now, the opening part of the trade.
                        //
                        pos.cost += (t.qty + pos.qty) * t.price;
                        
                        pos.qty += t.qty;
                        pos.quoteQty += t.quoteQty;
                        pos.avgPrice =  pos.cost / pos.qty;
                    }
                }
            }
        */

        };
       
        console.log(pos);
        return pos;
    } catch (error) {
        console.error(`Error fetching trades: ${error}`);
    }
}

exports.fetchPositions = fetchPositions;
async function fetchPositions(symbol) {
    try {
        const trades = await fetchMyTrades(symbol, 1000);
        const position = {
            symbol : symbol,
            qty : 0.0,
            avgPrice : 0.0,
            cost: 0.0,
            realisedPL : 0.0,
            sold : computePosition(trades.sells),
            bought  : computePosition(trades.buys)
        };

        position.qty = position.bought.qty - position.sold.qty;
        position.cost = position.bought.consideration -  position.sold.consideration;
        const matchedQty = Math.min(position.bought.qty,position.sold.qty);
        position.realisedPL = matchedQty*(position.sold.avgPrice-position.bought.avgPrice);

        if(position.qty>=0){
            position.avgPrice = position.bought.avgPrice;
        } else {
            position.avgPrice = position.sold.avgPrice;
        }

        console.log(position);
        return position;
    } catch (error) {
        console.error(`Error fetching trades: ${error}`);
    }
}

async function main() {
    if (require.main !== module) return;
    const symbol = process.argv[2];
    if(!symbol) throw 'Symbol not provided.'; 
    fetchPositions2(symbol);
}

if (require.main === module) main();