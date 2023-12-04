/**
https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data

https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker

https://binance-docs.github.io/apidocs/spot/en/#current-average-price
*/

const axios = require("axios");
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
        const bids = response.data.bids;
        const asks = response.data.asks;
        const priceDepth = {
            bids : bids.slice(0, 3).map(bid => ({
                price: parseFloat(bid[0]),
                qty: parseFloat(bid[1])
            })), 
            asks : asks.slice(0, 3).map(ask => ({
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
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4])
    }));
}


