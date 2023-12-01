/*
Fetch Trades to compute trading position and statistics. 

https://binance-docs.github.io/apidocs/spot/en/#account-trade-list-user_data
*/
const cfg = require('dotenv').config();
const axios = require('axios');
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
        startTime : new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).getTime(),
       // endTime : ts.getTime(), // endTime can't be more that 24hrs ahead of startTime.
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
        buys: response.data.filter(trade => trade.isBuyer),
        sells: response.data.filter(trade => !trade.isBuyer)
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
    } catch (error) {
        console.error(`Error fetching trades: ${error}`);
    }
}

async function main() {
    if (require.main !== module) return;
    fetchPositions('BTCUSDC');
    fetchPositions('ETHUSDC');
   // fetchPositions('USDCUSDT');
}

main();