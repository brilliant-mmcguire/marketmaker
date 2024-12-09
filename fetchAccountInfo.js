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

function filterByAsset(asset, price, accountInfo){
    let b = accountInfo.balances.filter(balance => (balance.asset==asset))[0];
    let q = b ? b.total : 0;
    return {
        qty  : q, 
        usd : Math.round(100*q*price)/100,
        free : Math.round(100*q*price)/100
    };
}
async function main() {
    try {
        const prcWindow = '4h';
        const noneZeroBalances =  await fetchAccountInfo();

        const prcUSDC = await fetchPriceStats('USDCUSDT', prcWindow);
        const prcETH = await fetchPriceStats('ETHUSDT', prcWindow);
        const prcBTC = await fetchPriceStats('BTCUSDT', prcWindow);
        const prcBNB = await fetchPriceStats('BNBUSDT', prcWindow);
        const prcXRP = await fetchPriceStats('XRPUSDT', prcWindow);
        const prcADA = await fetchPriceStats('ADAUSDT', prcWindow);
        const prcSOL = await fetchPriceStats('SOLUSDT', prcWindow);

        let balances = {
           USDT : filterByAsset('USDT', 1.00, noneZeroBalances), 
           USDC : filterByAsset('USDC', prcUSDC.weightedAvgPrice, noneZeroBalances),
           //USDC : filterByAsset('USDC', 1.0, noneZeroBalances),
           BTC  : filterByAsset('BTC', prcBTC.weightedAvgPrice, noneZeroBalances), 
           SOL  : filterByAsset('SOL', prcSOL.weightedAvgPrice, noneZeroBalances),
           ETH  : filterByAsset('ETH', prcETH.weightedAvgPrice, noneZeroBalances),
           XRP  : filterByAsset('XRP', prcXRP.weightedAvgPrice, noneZeroBalances),
           ADA  : filterByAsset('ADA', prcADA.weightedAvgPrice, noneZeroBalances),
           BNB  : filterByAsset('BNB', prcBNB.weightedAvgPrice, noneZeroBalances)
        }
        
        var b = Object.values(balances)
        let totalUsd = b.reduce((acc, item) => acc + item.usd, 0);
        totalUsd =  Math.round(100*totalUsd)/100;   
       
        console.log(`Balances for uid ${noneZeroBalances.uid} @ `, new Date());
        console.log(`total:      usd:${totalUsd}`);
        console.log(`usdt+usdc:  usd:${balances.USDT.usd + balances.USDC.usd} qty:${balances.USDT.qty + balances.USDC.qty}` );
        console.log(`btc+sol:    usd:${balances.SOL.usd+balances.BTC.usd}`);
        console.log(`eth+xrp+ada:usd:${balances.XRP.usd+balances.ADA.usd+balances.ETH.usd}`);
        console.log(balances);

    } catch (error) {
        console.error(`Error fetching Account Info ${error}`);
    }
}

if (require.main === module) main();


