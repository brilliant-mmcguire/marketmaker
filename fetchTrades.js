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
    const rawTrades = await fetchMyTrades(symbol, 1000, days);
    const trades = mapTrades(rawTrades.all);
    return computePositions(symbol, trades);
}

function VWAX(Q0, X0, tQ, tX) {
    Q1 = Q0*0.6 + tQ*0.4;
    X1 = (Q0*X0*0.6 + tQ*tX*0.4)/Q1;
    return { Q1: Q1, X1: X1 };
}

function computePositions(symbol,trades,rows = []) {
    try {
        const pos = {
            symbol : symbol,
            startTime: new Date(trades[0].time),
            endTime: new Date(trades[trades.length-1].time),
            qty : 0.0,      // Total amount of base coin held. 
            quoteQty : 0.0, // Total amount payment/quote coin held.  Assume this starts at zero. 
            cost: 0.0,      // Total amount of payment coin paid for qty / Book value of coin held. 
            costPrice : 0.0, // Avg price paid for base coin held. 
            costHigh : 0.0,  // Max pos.cost
            costLow : 0.0,  // Min pos.cost
            matchedQty : 0.0,   
            matchedCost : 0.0,
            matchedPL : 0.0,  // QQ - Q*costPrice
            commision : 0.0,  //Commission paid in BNB 
            commisionUSD : 0.0,  // Approximate USD value of commission.
            mAvgBuyPrice : trades[0].price, // rawTrades.buys[0].price,
            mAvgBuyAge : 0.0,
            mAvgBuyQty : 0.0,
            mAvgSellPrice : trades[0].price,
            mAvgSellAge : 0.0,
            mAvgSellQty : 0.0
        };

        for(let i = 0; i < trades.length; i++) {
            let t = trades[i];
            if(t.isBuyer) {
                // WANT TO WEIGHT PRICES IN A VWAP FASHION. SO THAT 
                // SMALL TRADES DO NOT SKEW moving averages. 
                let price1 = VWAX(
                    pos.mAvgBuyQty, 
                    pos.mAvgBuyPrice,
                    t.qty, 
                    t.price);
                    
                let age = VWAX(
                    pos.mAvgBuyQty, 
                    pos.mAvgBuyAge,
                    t.qty, 
                    ((Date.now() - t.time)/(60*60*1000)));
                    
                pos.mAvgBuyQty = price1.Q1;
                pos.mAvgBuyPrice = price1.X1;
                pos.mAvgBuyAge = age.X1; 

             //   pos.mAvgBuyQty = pos.mAvgBuyQty*0.6 + t.qty*0.4;
             //   pos.mAvgBuyAge = pos.mAvgBuyAge*0.6 + ((Date.now() - t.time)/(60*60*1000))*0.4;
             //   pos.mAvgBuyPrice = pos.mAvgBuyPrice*0.6 + t.price*0.4; 
            } else {
                let price1 = VWAX(
                    pos.mAvgSellQty, 
                    pos.mAvgSellPrice,
                    t.qty, 
                    t.price);
                    
                let age = VWAX(
                    pos.mAvgSellQty, 
                    pos.mAvgSellAge,
                    t.qty, 
                    ((Date.now() - t.time)/(60*60*1000)));
         
                pos.mAvgSellQty = price1.Q1;
                pos.mAvgSellPrice = price1.X1;
                pos.mAvgSellAge = age.X1; 

               // pos.mAvgSellQty = pos.mAvgSellQty*0.6 + t.qty*0.4;
               // pos.mAvgSellAge = pos.mAvgSellAge*0.6 + ((Date.now() - t.time)/(60*60*1000))*0.4; 
               // pos.mAvgSellPrice = pos.mAvgSellPrice*0.6 + t.price*0.4;
            };

            pos.commision += t.commission; 

            // Trade increases position.
            let newPositionQty = pos.qty+t.qty;
            
            if (Math.sign(pos.qty) == Math.sign(t.qty)) {
                // Increase position
                pos.qty += t.qty;
                pos.quoteQty -= t.quoteQty;    
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
                // pos.matchedPL += t.qty * (t.price - pos.costPrice); 
                pos.matchedQty += Math.abs(t.qty);
                //pos.matchedQuoteQty += Math.abs(-t.quoteQty);
                pos.matchedCost += Math.abs(t.qty * pos.costPrice);
                
                pos.qty += t.qty;
                pos.quoteQty -= t.quoteQty;
                pos.matchedPL = pos.quoteQty + pos.cost;
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

                pos.matchedQty += Math.abs(pos.qty);
                //pos.matchedQuoteQty += Math.abs(t.quoteQty*pos.qty/t.qty);
                pos.matchedCost += Math.abs(pos.cost);
                
                // zero out cost.
                pos.cost -= pos.qty * pos.costPrice;
                console.assert(
                    Math.abs(pos.cost<=0.00000001), 
                    `Expect zero pos.cost on flat position ${pos.cost}`); 

                //
                // now, the opening part of the trade.
                //
                pos.cost += (t.qty + pos.qty) * t.price;
                
                //
                // finally, the general case computations. 
                //
                pos.qty += t.qty;
                pos.quoteQty -= t.quoteQty;
                pos.costPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
                pos.matchedPL = pos.quoteQty + pos.cost;
            }
            pos.costHigh = Math.max(pos.costHigh, pos.cost);
            pos.costLow = Math.min(pos.costLow, pos.cost);
            pos.commisionUSD = pos.commision * 400;

            rows.push(convertPositionToCSVRow(t, pos));
        };
        return pos;
    } catch (error) {
        console.error(`Error fetching trades: ${error}`);
    }
}

function convertTradesToCSV(trades) {
    let rows = [];
    for(let i = 0; i < trades.length; i++) {
        let t = trades[i];
        let tTime = new Date(t.time)
        rows.push(`${tTime},${t.price},${t.qty},${t.quoteQty},${t.commission}`);
    }
    return rows.join('\n');
}

function convertPositionToCSVRow(trade, position) {
    let p = position;
    let t = trade;
    let tTime = new Date(t.time).toISOString().replace('T', ' ').substr(0, 19);
    let row = `${tTime},${t.qty},${t.quoteQty},${t.price},${p.qty},${p.quoteQty},${p.cost},${p.costPrice},${p.matchedQty},${p.matchedCost},${p.matchedPL}` // ,${p.commision},${p.commisionUSD}`;
    return row; 
}

function mapTrades(rawTrades) {
    let trades = [];
    for(let i = 0; i < rawTrades.length; i++) {
        let r = rawTrades[i];
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
    const trades = mapTrades(rawTrades.all);
 
    console.log(`Bought `, computePosition(rawTrades.buys));
    console.log(`Sold `, computePosition(rawTrades.sells));

    let rows = [];
    const pos = computePositions(symbol, trades, rows);
    fs.writeFileSync('fetchTradesOutput.csv', rows.join('\n'));
    console.log(`Position `, pos);
}

if (require.main === module) main();
