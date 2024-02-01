const cfg = require('dotenv').config();
const axios = require('axios');
const { Console } = require('console');
const crypto = require('crypto');
const qs = require('qs');
 
const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const BASE_URL = 'https://api.binance.com';

function createSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function fetch24hTrades(symbol, daysAgo=1) {
    const endpoint = '/api/v3/myTrades';
    const ts = (new Date().getTime() - (daysAgo * 24 * 60 * 60 * 1000));
    
    const params = {
        symbol: symbol,
        timestamp: Date.now(),
        limit: 1000,
        startTime : ts,
        endTime : (ts -1 + 24 * 60 * 60 * 1000)
    };

    const query = qs.stringify(params);
    const signature = createSignature(query);
    const url = `${BASE_URL}${endpoint}?${query}&signature=${signature}`;
    const response = await axios.get(url, {
        headers: {
            'X-MBX-APIKEY': API_KEY
        }
    });
    return {params: params, trades: response.data};    
}

 function parseTrades(rawTrades) {
    return rawTrades.map( t => ({
        isBuyer : t.isBuyer,
        symbol: t.symbol,
        id: t.id,
        time: t.time,
        orderId : t.orderId,
        qty: (t.isBuyer ? 1 : -1) * parseFloat(t.qty) ,
        quoteQty : (t.isBuyer ? 1 : -1) * parseFloat(t.quoteQty),
        price : parseFloat(t.price),
        commission : parseFloat(t.commission)
    }))
 }

function accumulateTrades(trades) {
    const qty = trades.reduce((sum, t) => sum + t.qty, 0);
    const quoteQty = trades.reduce((sum, t) => sum + t.quoteQty, 0);
    const cost = trades.reduce((sum, t) => sum + (t.qty * t.price), 0);
    const commision = trades.reduce((sum, t) => sum + t.commission, 0);

    return {
        tradeCount: trades.length,
        qty: trades.reduce((sum, t) => sum + t.qty, 0),
        quoteQty: trades.reduce((sum, t) => sum + t.quoteQty, 0),
        cost: trades.reduce((sum, t) => sum + (t.qty * t.price), 0),
        costPrice: qty!=0 ? cost / qty : 0.0,
        commission: trades.reduce((sum, t) => sum + t.commission, 0),
    };
}

function accumulateMoreTrades(netAcc, acc) {
    netAcc.tradeCount += acc.tradeCount;
    netAcc.qty += acc.qty;
    netAcc.quoteQty += acc.quoteQty;
    netAcc.cost += acc.cost;
    netAcc.costPrice = netAcc.qty!=0 ? netAcc.cost / netAcc.qty : 0.0;
    netAcc.commission += acc.commission;
}

function makeSession(params, bought, sold) { 

    let matchedQty = Math.min(bought.qty, Math.abs(sold.qty));
    let surplusQty = bought.qty + sold.qty;

    return {
        symbol : params.symbol,
        startTime: (new Date(params.startTime)),
        endTime: (new Date(params.endTime)),
        
        // Intraday matches.
        matchedQty: matchedQty,
        matchedCost: Math.min(bought.cost, Math.abs(sold.cost)),
        matchedPL: matchedQty*(sold.costPrice - bought.costPrice),
    
         // End of day net or surplus position. 
        surplusQty: surplusQty,
        surplusCost: surplusQty*(surplusQty > 0 ? bought.costPrice : sold.costPrice), 
        surplusCostPrice: surplusQty >=0 ? bought.costPrice : sold.costPrice,

        commision : bought.commission + sold.commission,

        bought: bought,
        sold: sold
    };

}

function updatePosition(pos, session) { 

    let s = session;
    pos.endTime = s.endTime;

    // Trade increases position.
    let newPositionQty = pos.qty+s.surplusQty;
    
    if (Math.sign(pos.qty) == Math.sign(s.surplusQty)) {
        // Increase in position magnitude
        pos.qty += s.surplusQty;
        pos.cost += s.surplusCost;
        pos.costPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
        // PL does not change.
    
    } else if(Math.sign(newPositionQty) == Math.sign(pos.qty)) {
        // Reduce in position magnititude
        console.assert(
            Math.abs(pos.qty+s.surplusQty) < Math.abs(pos.qty), 
            `Expect reduced position ${pos.qty} :> ${newPositionQty}`);

        pos.cost += s.surplusQty * pos.costPrice; 
        pos.realisedPL += s.surplusQty * (pos.costPrice - s.surplusCostPrice); 
        pos.qty += s.surplusQty;
        // costPrice doesn't change.
    
    } else {
        // Flip position
        console.assert(
            Math.sign(newPositionQty)!= Math.sign(pos.qty), 
            `Expect flipped position ${pos.qty} :> ${newPositionQty}`);
    
        //
        // first, the closing part of the trade.
        //

        // zero out cost.
        pos.cost -= pos.qty * pos.costPrice; 
        console.assert(
            Math.abs(pos.cost<=0.00000001), 
            `Expect zero pos.cost on flat position ${pos.cost}`); 

        pos.realisedPL -= pos.qty * (pos.costPrice - s.surplusCostPrice); 
        
        //
        // now, the opening part of the trade.
        //
        pos.cost += (s.surplusQty + pos.qty) * s.surplusCostPrice;
        
        //
        // finally, the general case computations. 
        //
        pos.qty += s.surplusQty;
        pos.costPrice =  Math.abs(pos.qty) >= 0.00000001 ? pos.cost / pos.qty : 0.0;
    }
    //pos.realisedPL += s.matchedPL;
    pos.matchedQty += s.matchedQty;
    pos.matchedPL += s.matchedPL;
    pos.matchedCost += s.matchedCost;

    return pos;
}

async function main() {

    if (require.main !== module) return;
    const symbol = process.argv[2];
    let dayCount = parseInt(process.argv[3]);

    if(!symbol) throw 'Symbol not provided.'; 
    if(isNaN(dayCount))  dayCount = 7 ;
   
   // console.log(dayCount); return;

    let sessions = []; 

    let netBought = accumulateTrades([]);
    let netSold = accumulateTrades([]);
    
    for(let i = dayCount+1; i >= 1; i--) {
        let stats = await fetch24hTrades(symbol, i); 

        let trades = parseTrades(stats.trades);
        let buys = trades.filter(trade => trade.isBuyer);
        let sells = trades.filter(trade => !trade.isBuyer);
        let bought = accumulateTrades(buys);
        let sold = accumulateTrades(sells);

        accumulateMoreTrades(netBought,bought);
        accumulateMoreTrades(netSold,sold);

        let session = makeSession(stats.params,bought,sold);
        console.log(`session[${i}]: `, session);
        sessions.push(session);
    }
    
    let netParams = {
        symbol: symbol, 
        startTime : sessions[0].startTime,
        endTime : sessions[sessions.length-1].endTime
    }
    let netSession = makeSession(netParams, netBought, netSold);

    console.log("netSession:", netSession);
}

if (require.main === module) main();
