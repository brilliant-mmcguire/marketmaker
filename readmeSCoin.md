# Purpose:

Automates and manages order placement for USDCUSDT, aiming to maintain a balanced and adaptive market-making strategy.  Places and cancels buy/sell orders based on market conditions, current position, and recent trading activity.

# Key Features & Logic

**Order Management:** 
- Keeps a certain number of active buy and sell orders at each price level.
- Avoids unnecessary order cancellations to maintain queue position in the order book.
- Cancels only stale or out-of-bounds orders (those outside the calculated price ceiling/floor or exceeding quota).

**Adaptive Position Sizing:**
- Uses a sigmoid function to determine the target USDC balance based on the current price, with higher balances at lower prices and vice versa.
- Dynamically scales order quantity based on available USDC/USDT balances.

**Market Data Integration:**
- Fetches current order book depth, open orders, account balances, recent trading positions, and price statistics.

**Price and Quota Logic:**
- Calculates price ceilings/floors for bids and offers using exponential moving averages of recent trades, market price, and position deviation.
- Adjusts order quotas based on the size of the order book at each price level, encouraging more orders where there is more liquidity.

**Stochastic Order Placement:**
- Uses randomness to decide whether to place an order at a given time, spreading out order placement to avoid predictable patterns.

**Position Deviation Handling:**
- Adjusts aggressiveness of order placement based on how far the current position deviates from the target.

**Error Handling:**

Logs errors encountered during order placement or cancellation.

# Main Workflow 
1. Fetches:
- Order book depth (fetchPriceDepth)
- Account balances (fetchAccountInfo)
- Open orders (fetchOpenOrders)
- Recent trading positions (fetchPositions)
- Price statistics (fetchPriceStats)
2. Calculates:
- Target USDC quantity using a sigmoid function of price.
- Position deviation from the target.
- Tapered buy/sell prices based on trade history and market price.
3. Places Orders:
- Calls makeBids and makeOffers to manage buy and sell orders:
- Cancels stale/out-of-bounds orders.
- Places new orders if quota is not full and stochastic decision allows.

# Exports:
The main function placeSCoinOrders for use as a module or script.

# Notable Functions
- targetQty(bestPrice): Calculates the target USDC balance based on price.
- scaleOrderQty(balances): Scales order size based on available balances.
- makeBids / makeOffers: Core logic for managing buy/sell orders.
- stochasticDecision(orderCount): Randomizes order placement timing.

# In summary:
This script is a market-making bot for USDC/USDT, using adaptive, probabilistic, and position-aware logic to manage orders efficiently and responsively in a live market.