/*
We are interested in our current positions in the assets and currencies
we are trading in.  That is BTC, ETH, USDC and USDT.   
https://binance-docs.github.io/apidocs/spot/en/#spot-account-endpoints

Do we care about recent trading activity, average prices, p&l?
*/


const { fetchPriceStats } = require('./marketDataTxns');
const crypto = require('crypto');
const cfg = require('dotenv').config();
const API_SECRET = process.env.API_SECRET;
const { fetchAccountInfo } = require('./accountTxns');
const https = require('https');

// Function to get public IP address
async function getPublicIP() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data.trim()));
        }).on('error', reject);
    });
}

// Custom Error Classes
class AccountError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AccountError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date();
    }
}

// Retry Utility
async function withRetry(operation, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Check for 401 authentication error
            const isAuthError = error.response?.status === 401 || 
                              error.code === -2015 ||  // Binance invalid API-key
                              error.code === 401;
                              
            if (isAuthError) {
                try {
                    const ip = await getPublicIP();
                    console.error(`Authentication error (attempt ${attempt}/${maxRetries}) from IP ${ip}:`, 
                        error.response?.data || error.message
                    );
                } catch (ipError) {
                    console.error(`Authentication error (attempt ${attempt}/${maxRetries}) - Could not fetch IP:`, 
                        error.response?.data || error.message
                    );
                }
                // Add longer delay for auth errors to allow for token refresh
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            
            if (attempt === maxRetries) break;
            
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Get IP address for final error
    let ipAddress;
    try {
        ipAddress = await getPublicIP();
    } catch (ipError) {
        ipAddress = 'Could not fetch IP';
    }
    
    throw new AccountError(
        `Operation failed after ${maxRetries} attempts`,
        'RETRY_EXHAUSTED',
        { 
            originalError: lastError,
            errorResponse: lastError.response?.data,
            errorCode: lastError.code || lastError.response?.status,
            ipAddress
        }
    );
}

// Asset configuration
const SUPPORTED_ASSETS = {
    USDT: { 
        pair: 'USDTUSDT', 
        fixedPrice: 1.00  // Special case for USDT with fixed price
    },
    USDC: { pair: 'USDCUSDT' },
    USDP: { pair: 'USDPUSDT' },
    FDUSD: { pair: 'FDUSDUSDT' },
    BTC: { pair: 'BTCUSDT' },
    SOL: { pair: 'SOLUSDT' },
    ETH: { pair: 'ETHUSDT' },
    XRP: { pair: 'XRPUSDT' },
    ADA: { pair: 'ADAUSDT' },
    XLM: { pair: 'XLMUSDT' },
    BNB: { pair: 'BNBUSDT' }
};

// Configuration constants
const PRICE_WINDOW = '4h';

function filterByAsset(asset, price, accountInfo){
    let b = accountInfo.balances.filter(balance => (balance.asset==asset))[0];
    let qt = b ? b.total : 0;
    let qf = b ? b.free : 0;
    return {
        qty  : qt, 
        usd  : Math.round(100*qt*price)/100,
        free : qf
    };
}

async function fetchAssetPrices() {
    const prices = {};
    for (const [asset, config] of Object.entries(SUPPORTED_ASSETS)) {
        try {
            if (config.fixedPrice) {
                prices[asset] = { weightedAvgPrice: config.fixedPrice };
            } else {
                prices[asset] = await withRetry(() => fetchPriceStats(config.pair, PRICE_WINDOW));
            }
        } catch (error) {
            console.error(`Failed to fetch price for ${asset}:`, error.message);
            throw error;
        }
    }
    return prices;
}

async function main() {
    try {
        const noneZeroBalances = await withRetry(() => fetchAccountInfo());
        const prices = await fetchAssetPrices();

        let balances = {};
        for (const [asset, config] of Object.entries(SUPPORTED_ASSETS)) {
            balances[asset] = filterByAsset(
                asset, 
                prices[asset].weightedAvgPrice,
                noneZeroBalances
            );
        }
        
        var b = Object.values(balances);
        let totalUsd = b.reduce((acc, item) => acc + item.usd, 0);
        totalUsd = Math.round(100*totalUsd)/100;   
       
        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        console.log(`total:      usd:${totalUsd}`);
        console.log(`usd-t+c+p:  usd:${balances.USDT.usd + balances.USDC.usd + balances.USDP.usd + balances.FDUSD.usd} qty:${balances.USDT.qty + balances.USDC.qty + balances.USDP.qty + balances.FDUSD.qty}` );
        console.log(`btc+sol+xrp:    usd:${balances.XRP.usd+balances.SOL.usd+balances.BTC.usd}`);
        console.log(`eth+ada:usd:${balances.ADA.usd+balances.ETH.usd}`);
        console.log(balances);

    } catch (error) {
        if (error instanceof AccountError) {
            console.error('Account error:', {
                message: error.message,
                code: error.code,
                details: error.details
            });
        } else {
            console.error('Unexpected error:', error.message);
            if (error.response?.data) {
                console.error('API Response:', error.response.data);
            }
        }
        process.exit(1);
    }
}

if (require.main === module) main();


