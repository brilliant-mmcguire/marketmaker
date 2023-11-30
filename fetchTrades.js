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


    const timestamp = Date.now();
    const params = {
        symbol: symbol,
        timestamp: timestamp,
        limit: limit,
        // Add other necessary parameters like startTime and endTime for the last 24 hours
        startTime: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
    };
//    const startTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const query = qs.stringify(params);
    //const query = `symbol=${symbol}&limit=${limit}&timestamp=${timestamp}&startTime=${startTime}`;
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
        const positions = {
            symbol : symbol,
            sold : computePosition(trades.sells),
            bought  : computePosition(trades.buys)
        };
        console.log(positions);
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