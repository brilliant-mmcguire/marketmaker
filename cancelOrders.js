/*
We can cancel orders for a given symbol to clear them out before placing new orders.
*/
const { cancelOrder, cancelOrders, cancelOpenOrders, fetchOpenOrders } = require('./orderTxns');
const https = require('https');

// Configuration
const CONFIG = {
    staleOrderThreshold: 0.5 * 60 * 60 * 1000, // 30 minutes in milliseconds
    maxRetries: 3,
    retryDelay: 2000
};

// Custom Error Classes
class OrderError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'OrderError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date();
    }
}

// Function to get public IP address for error reporting
async function getPublicIP() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data.trim()));
        }).on('error', reject);
    });
}

// Retry Utility
async function withRetry(operation, maxRetries = CONFIG.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            // Check for authentication errors
            const isAuthError = error.response?.status === 401 || 
                              error.code === -2015 ||
                              error.code === 401;
                              
            if (isAuthError) {
                const ip = await getPublicIP().catch(() => 'unknown');
                console.error(`Authentication error (attempt ${attempt}/${maxRetries}) from IP ${ip}:`, 
                    error.response?.data || error.message
                );
                await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
                continue;
            }
            
            if (attempt === maxRetries) break;
            
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            console.log(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new OrderError(
        `Operation failed after ${maxRetries} attempts`,
        'RETRY_EXHAUSTED',
        { originalError: lastError }
    );
}

function filterStaleOrders(orders, threshold = CONFIG.staleOrderThreshold) {
    const cutoffTime = Date.now() - threshold;
    return {
        staleOrders: orders.filter(order => order.time < cutoffTime),
        activeOrders: orders.filter(order => order.time >= cutoffTime)
    };
}

function groupOrdersBySide(orders) {
    return {
        sells: orders.filter(order => order.side === 'SELL'),
        buys: orders.filter(order => order.side === 'BUY')
    };
}

async function cancelStaleOrders(symbol) {
    try {
        const orders = await withRetry(() => fetchOpenOrders(symbol));
        const { staleOrders, activeOrders } = filterStaleOrders(orders);
        
        if (staleOrders.length === 0) {
            console.log('No stale orders found');
            return;
        }

        const { sells, buys } = groupOrdersBySide(staleOrders);
        
        console.log(`Found ${staleOrders.length} stale orders (${sells.length} sells, ${buys.length} buys)`);
        
        if (sells.length > 0) {
            console.log('Cancelling stale sell orders:', 
                sells.map(o => `${o.symbol} @ ${o.price}`).join(', ')
            );
            await withRetry(() => cancelOrders(sells));
        }
        
        if (buys.length > 0) {
            console.log('Cancelling stale buy orders:', 
                buys.map(o => `${o.symbol} @ ${o.price}`).join(', ')
            );
            await withRetry(() => cancelOrders(buys));
        }
        
        return { cancelled: staleOrders.length, remaining: activeOrders.length };
    } catch (error) {
        throw new OrderError(
            'Failed to cancel stale orders',
            'CANCEL_FAILED',
            { symbol, error: error.message }
        );
    }
}

async function main() {
    const symbol = process.argv[2];
    if (!symbol) {
        console.error('Error: Symbol not provided');
        process.exit(1);
    }

    try {
        console.log(`Processing orders for ${symbol} at ${new Date().toISOString()}`);
        const result = await cancelStaleOrders(symbol);
        console.log(`Successfully cancelled ${result.cancelled} orders. ${result.remaining} active orders remaining.`);
    } catch (error) {
        if (error instanceof OrderError) {
            console.error('Order error:', {
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