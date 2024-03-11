/*
Fetch Trades to compute trading position and statistics. 


*/
const cfg = require('dotenv').config();
const axios = require('axios');
const { Console } = require('console');
const crypto = require('crypto');
const qs = require('qs');
 
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const BASE_URL = 'https://api.binance.com';

const fs = require('fs');

function createSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function fetchMyTrades(symbol, limit = 1000, days=NaN) {
    const endpoint = '/api/v3/myTrades';
    const ts = new Date();
    
    let params = {};
    if(isNaN(days)) {
        params = {
            symbol: symbol,
            timestamp: Date.now(),
            limit: limit,
        }
    } else {
        params = {
            symbol: symbol,
            timestamp: Date.now(),
            limit: limit,
            // startTime : new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()-1).getTime(),
            // endTime : ts.getTime(), // endTime can't be more that 24hrs ahead of startTime.
            startTime : (new Date().getTime() - (days * 24 * 60 * 60 * 1000))
        };
    }
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
        cost: totalValue,
        costPrice: totalValue / totalQty,
        commission: totalCommision
    };
}

exports.fetchPositions = fetchPositions;
async function fetchPositions(symbol, days) {
    const trades = await fetchMyTrades(symbol, 1000, days);
    return computePositions(symbol, trades);
}

function computePositions(symbol, trades) {
    try {
        //const trades = await fetchMyTrades(symbol, 1000, days);
        const pos = {
            symbol : symbol,
            startTime: new Date(trades.all[0].time),
            endTime: new Date(trades.all[trades.all.length-1].time),
            qty : 0.0,
            quoteQty : 0.0,
            cost: 0.0,
            costPrice : 0.0,
            costHigh : 0.0,
            costLow : 0.0,
            matchedQty : 0.0,
            matchedCost : 0.0,
            matchedPL : 0.0,
            commision : 0.0,
            commisionUSD : 0.0,
            mAvgBuyPrice : trades.buys[0].price,
            mAvgSellPrice : trades.sells[0].price,
            sold    : computePosition(trades.sells),
            bought  : computePosition(trades.buys)
        };

        for(let i = 0; i < trades.all.length; i++) {
            let r = trades.all[i];
            let t = {
                isBuyer : r.isBuyer, 
                qty : 0.0, quoteQty : 0.0, 
                price : parseFloat(r.price), 
                commission : parseFloat(r.commission) 
            };
            
            if(t.isBuyer) {
                t.qty = parseFloat(r.qty); 
                t.quoteQty = parseFloat(r.quoteQty); 
            } else {
                t.qty = -1.0 * parseFloat(r.qty); 
                t.quoteQty = -1.0 * parseFloat(r.quoteQty);
            };

            if(t.isBuyer) {
                pos.mAvgBuyPrice = pos.mAvgBuyPrice*0.8 + t.price*0.2;
            } else {
                pos.mAvgSellPrice = pos.mAvgSellPrice*0.8 + t.price*0.2;
            };

            pos.commision += t.commission; 

            // Trade increases position.
            let newPositionQty = pos.qty+t.qty;
       
            if (Math.sign(pos.qty) == Math.sign(t.qty)) {
                // Increase position
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;    
                pos.cost += t.qty*t.price;
                pos.costPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
                // PL does not change.
            
            } else if(Math.sign(newPositionQty) == Math.sign(pos.qty)) {
                // Reduce position
                console.assert(
                    Math.abs(pos.qty+t.qty) < Math.abs(pos.qty), 
                    `Expect reduced position ${pos.qty} :> ${newPositionQty}`
                    );
                
                pos.cost += t.qty * pos.costPrice; 
                pos.matchedPL += t.qty * (pos.costPrice - t.price); 
                pos.matchedCost += Math.abs(t.quoteQty);
                pos.matchedQty += Math.abs(t.qty);
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;
                // costPrice doesn't change.
            
            } else {
                // Flip position
                console.assert(
                    Math.sign(newPositionQty)!= Math.sign(pos.qty), 
                    `Expect flipped position ${pos.qty} :> ${newPositionQty}`
                    );
            
                //
                // first, the closing part of the trade.
                //

                // zero out cost.
                pos.cost -= pos.qty * pos.costPrice; 
                console.assert(
                    Math.abs(pos.cost<=0.00000001), 
                    `Expect zero pos.cost on flat position ${pos.cost}`); 

                pos.matchedPL -= pos.qty * (pos.costPrice - t.price); 
                pos.matchedQty += Math.abs(pos.qty);
                pos.matchedCost += Math.abs(pos.cost);
                
                //
                // now, the opening part of the trade.
                //
                pos.cost += (t.qty + pos.qty) * t.price;
                
                //
                // finally, the general case computations. 
                //
                pos.qty += t.qty;
                pos.quoteQty += t.quoteQty;
                pos.costPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
            }
            pos.costHigh = Math.max(pos.costHigh, pos.cost);
            pos.costLow = Math.min(pos.costLow, pos.cost);
        };
        pos.commisionUSD = pos.commision * 400;
        console.log(pos);
        return pos;
    } catch (error) {
        console.error(`Error fetching trades: ${error}`);
    }
}

function convertToCSV(trades) {
    let rows = [];
    for(let i = 0; i < trades.length; i++) {
        let t = trades[i];
        rows.push(`${t.price},${t.qty},${t.quoteQty},${t.commission}`);
    }
    return rows.join('\n');
}

function mapTrades(rawTrades) {
    let trades = [];
    for(let i = 0; i < rawTrades.all.length; i++) {
        let r = rawTrades.all[i];
        let t = {
            symbol : r.symbol,
            time : r.time,
            isBuyer : r.isBuyer, 
            qty : 0.0, quoteQty : 0.0, 
            price : parseFloat(r.price), 
            commission : parseFloat(r.commission) 
        };
        if(t.isBuyer) {
            t.qty = parseFloat(r.qty); 
            t.quoteQty = parseFloat(r.quoteQty); 
        } else {
            t.qty = -1.0 * parseFloat(r.qty); 
            t.quoteQty = -1.0 * parseFloat(r.quoteQty);
        };
        trades.push(t);
    }
    return trades;
}

async function main() {
    if (require.main !== module) return;
    const symbol = process.argv[2];
    const days = (process.argv[3] == undefined) ? NaN : parseFloat(process.argv[3]);
    
    if(!symbol) throw 'Symbol not provided.'; 

    const rawTrades = await fetchMyTrades(symbol, 1000, days);
    const trades = mapTrades(rawTrades);
    fs.writeFileSync('fetchTradesOutput.csv', convertToCSV(trades));
    computePositions(symbol, rawTrades);
}

if (require.main === module) main();