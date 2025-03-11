const { fetchKLines } = require('./marketDataTxns');
const fs = require('fs');

function transformToTimeSeries(kLines){
    return {
        hour : kLines.map(d => d.openTime.getHours()),
        price : kLines.map(d => d.avgPrice) 
    //    open : kLines.map(d => d.open),
    //    close : kLines.map(d => d.close),
    //    high : kLines.map(d => d.high),
    //    low : kLines.map(d => d.low)
    };
}


function computeStatistcs(prices) {
  
    const returns = prices.slice(1).map((price, h) => 
        (price - prices[h]) / prices[h]
    );
    const drift = (returns.reduce((sum, r) => sum + r, 0) / returns.length);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - drift, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return {
        volatility,
        drift
    };
}

async function fetchAndLogHourlyPrices(symbol, intervalCount=7) {   
    const interval = '15m';

    try {
        const kLines = await fetchKLines(symbol, interval, intervalCount);
        convertKlinesToCsv(kLines);

        const prices = transformToTimeSeries(kLines);
        
        const results = {
            interval: interval,
            intervalCount: intervalCount,
            startTime : kLines[0].openTime,
            endTime: kLines[kLines.length-1].closeTime,
            //hour: prices.hour,
            lastKLine: kLines[kLines.length-1],
            stats: computeStatistcs(prices.price)
        }

        console.log(`Hourly price time series for ${symbol}`);
        console.log(results);

    } catch (error) {
        console.error("Error fetching Hourly Prices", error.message);
    } 
}

function convertKlinesToCsv(kLines) {
    let rows = [];
  //  console.log(kLines);
    for(let i = 0; i < kLines.length; i++) {
        let k = kLines[i];
        let kTime = new Date(k.openTime).toISOString().replace('T', ' ').substr(0, 16);
        let row = `${kTime},${k.qty},${k.quoteQty},${k.low},${k.high},${k.avgPrice},${k.buyAvgPrice},${k.sellAvgPrice}`;
        rows.push(row);
    }
    fs.writeFileSync('fetchPricesOutput.csv', rows.join('\n'));
}

async function main() {
    if (require.main !== module) return;
    console.log(process.argv)

    const symbol = process.argv[2];
    if(!symbol) throw 'Symbol not provided.'; 
    
    var intervalCount = process.argv[3]
    if(isNaN(intervalCount)) intervalCount = 7 ;

    fetchAndLogHourlyPrices(symbol, intervalCount);
}

if (require.main === module) main();

