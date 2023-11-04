/*
Fetch Trades to compute trading position and statistics. 

https://binance-docs.github.io/apidocs/spot/en/#account-trade-list-user_data
*/
const cfg = require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const BASE_URL = 'https://api.binance.com';

function createSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}
async function fetchMyTrades(symbol, limit) {
    const endpoint = '/api/v3/myTrades';
    const timestamp = Date.now();
    const query = `symbol=${symbol}&limit=${limit}&timestamp=${timestamp}`;
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
        const trades = await fetchMyTrades(symbol, 50);
        const positions = {
            symbol : symbol,
            long  : computePosition(trades.buys),
            short : computePosition(trades.sells)
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
}
main();