/**
https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data

https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker

https://binance-docs.github.io/apidocs/spot/en/#current-average-price

https://binance-docs.github.io/apidocs/spot/en/#rolling-window-price-change-statistics
*/

const axios = require("axios");
const { parse } = require("dotenv");
//const crypto = require('crypto');
//const qs = require('qs');

exports.fetchBestOfferPrice = fetchBestOfferPrice;
async function fetchBestOfferPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/depth', {
            params: { symbol: symbol, limit: 5 }
        });
        const bestOfferPrice = response.data.asks[0][0]; // Top ask price
        return parseFloat(bestOfferPrice);
    } catch (error) {
        console.error(`Error fetching order book: ${error.message}`);
        return null;
    }
}

exports.fetchBestBidPrice = fetchBestBidPrice;
async function fetchBestBidPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/depth', {
            params: { symbol: symbol, limit: 5 }
        });
        const bestBidPrice = response.data.bids[0][0]; // Top bid price
        return parseFloat(bestBidPrice);
    } catch (error) {
        console.error(`Error fetching order book: ${error.message}`);
        return null;
    }
}

exports.fetchPriceDepth = fetchPriceDepth;
async function fetchPriceDepth(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/depth', {
            params: { symbol: symbol, limit: 5 }
        });
        
        const { bids, asks } = response.data;
    
        // Verify sorting (optional, usually API ensures correct sorting)
        const bidsSorted = bids.every((bid, i, arr) => i === 0 || parseFloat(bid[0]) <= parseFloat(arr[i - 1][0]));
        const asksSorted = asks.every((ask, i, arr) => i === 0 || parseFloat(ask[0]) >= parseFloat(arr[i - 1][0]));

        if (!bidsSorted || !asksSorted) {
            throw new Error('Order book not sorted correctly');
        }

        const priceDepth = {
            bids : bids.map(bid => ({
                price: parseFloat(bid[0]),
                qty: parseFloat(bid[1])
            })), 
            asks : asks.map(ask => ({
                price: parseFloat(ask[0]),
                qty: parseFloat(ask[1])
            }))
        }
        return priceDepth;
    } catch (error) {
        console.error(`Error fetching order book: ${error.message}`);
        return null;
    }
}

exports.fetchLastPrice = fetchLastPrice;
async function fetchLastPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/price', {
            params: {
                symbol: symbol,
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return null;
    }
}
exports.fetchAvgPrice = fetchAvgPrice;
async function fetchAvgPrice(symbol) {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/avgPrice', {
            params: {
                symbol: symbol,
            }
        });
        return {
            symbol: symbol, 
            mins: response.data.mins,
            price: response.data.price
        }
    } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return null;
    }
}
exports.fetchKLines = fetchKLines;
async function fetchKLines(symbol, interval, limit) {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
            symbol: symbol,
            interval: interval,
            limit: limit,
        }
    });
    return response.data.map(d => ({
        openTime: new Date(d[0]),
        tradeCount: parseFloat(d[8]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        qty: parseFloat(d[5]),
        quoteQty: parseFloat(d[7]),
        avgPrice: parseFloat(d[7])/parseFloat(d[5]),
        buyQty : parseFloat(d[9]),
        buyQuoteQty : parseFloat(d[10]),
        buyAvgPrice : parseFloat(d[10])/parseFloat(d[9]), 
        sellQty : parseFloat(d[5])-parseFloat(d[9]),
        sellQuoteQty : parseFloat(d[7])- parseFloat(d[10]),
        sellAvgPrice : (parseFloat(d[7])- parseFloat(d[10])) / (parseFloat(d[5])-parseFloat(d[9])) 

    }));
}
exports.fetchPriceStats = fetchPriceStats;
async function fetchPriceStats(symbol, windowSize='2h') {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker', {
            params: {
                symbol: symbol,
                windowSize: windowSize,
            }
        });
        let d = response.data;
        return {
            symbol    : symbol, 
            openTime  : new Date(d.openTime),
            closeTime : new Date(d.closeTime),
            highPrice : parseFloat(d.highPrice),
            lowPrice  : parseFloat(d.lowPrice),
            lastPrice : parseFloat(d.lastPrice),
            weightedAvgPrice : parseFloat(d.weightedAvgPrice)
        };
    } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error.message);
        return null;
    }
}
