/**
 * analyze.js
 */
const { 
  calculateMA, calculateVolatilityRatio, calculateLRS,
  calculateAverage, calculateMaxClose, calculateSTDEV
} = require('../stockAnalysis');

const UTC_OFFSET_SECONDS = 8 * 60 * 60; 
const OFFSET = 3;

function convertTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    const date = new Date((unixSeconds + UTC_OFFSET_SECONDS) * 1000);
    return date.toUTCString().replace('GMT', 'WITA'); 
}

async function processSingleTicker(ticker, interval, range, backday = 0) {
    if (!ticker) return { ticker, status: "Error", message: "No Ticker" };

    let subInterval = interval === '1h' ? '15m' : '1h';
    let defaultRange = range || (interval === '1h' ? '10d' : '3mo');

    try {
        const [mainRes, subRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${defaultRange}`),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subInterval}&range=${defaultRange}`)
        ]);

        const mainData = await mainRes.json();
        const subData = await subRes.json();
        const mainResult = mainData?.chart?.result?.[0];
        const subResult = subData?.chart?.result?.[0];

        if (!mainResult || !subResult) return { ticker, status: "Error", message: "Data Empty" };

        const subQuote = subResult.indicators.quote[0];
        const subCandles = subResult.timestamp.map((ts, i) => ({
          timestamp: ts,
          open: subQuote.open[i],
          high: subQuote.high[i],
          low: subQuote.low[i],
          close: subQuote.close[i],
          volume: subQuote.volume[i] || 0
        })).filter((d) => {
            const isValidPrice = typeof d.close === 'number' && !isNaN(d.close);
            const dateObj = new Date(d.timestamp * 1000);
            const seconds = dateObj.getUTCSeconds();
            const minutes = dateObj.getUTCMinutes();
            // Filter: Detik 00 dan Menit kelipatan 15 (0, 15, 30, 45)
            const isValidSecond = seconds === 0;
            const isValidMinute = minutes === 0 || minutes === 15 || minutes === 30 || minutes === 45;
            return isValidPrice && isValidSecond && isValidMinute;
        });

        const mainQuoteRaw = mainResult.indicators.quote[0];
        const mainCandles = mainResult.timestamp.map((ts, i) => ({
            timestamp: ts,
            open: mainQuoteRaw.open[i],
            high: mainQuoteRaw.high[i],
            low: mainQuoteRaw.low[i],
            close: mainQuoteRaw.close[i],
            volume: mainQuoteRaw.volume[i] || 0
        })).filter((d) => {
            const isValidPrice = typeof d.close === 'number' && !isNaN(d.close);
            const dateObj = new Date(d.timestamp * 1000);
            const seconds = dateObj.getUTCSeconds();
            const mins = dateObj.getUTCMinutes();
            const isValidSecond = seconds === 0;
            const isValidMinute = mins === 0 || mins === 15 || mins === 30 || mins === 45;
            return isValidPrice && isValidSecond && isValidMinute;
        });

        const historyData = [];
        let runningNetOBV = 0;

        for (let i = 0; i < mainCandles.length; i++) {
            const currentCandle = mainCandles[i];
            const nextCandle = mainCandles[i + 1];
            const intervalStep = (mainCandles.length > 1) ? (mainCandles[1].timestamp - mainCandles[0].timestamp) : 3600;
            const nextMainTs = nextCandle ? nextCandle.timestamp : (currentCandle.timestamp + intervalStep);
            
            const subCandlesInRange = subCandles.filter(sub => sub.timestamp >= currentCandle.timestamp && sub.timestamp < nextMainTs);
            const totalSubVolume = subCandlesInRange.reduce((acc, curr) => acc + (curr.volume || 0), 0);
            const scaleFactor = (totalSubVolume > 0 && currentCandle.volume > 0) ? currentCandle.volume / totalSubVolume : 1;
        
            let currentDeltaOBV = 0;

            subCandlesInRange.forEach((sub, idx) => {
                const subOpen = sub.open ?? sub.close;
                const subClose = sub.close;
                const subHigh = sub.high ?? Math.max(subOpen, subClose);
                const subLow = sub.low ?? Math.min(subOpen, subClose);
                const syncedVol = (sub.volume || 0) * scaleFactor;
                
                // --- IMPLEMENTASI RUMUS HYBRID ---
                if (subClose !== subOpen) {
                    // Logika Body Strength
                    const bodyAbs = Math.abs(subClose - subOpen);
                    const hlRange = Math.max(1, (subHigh - subLow));
                    const multiplier = bodyAbs / hlRange;
                    
                    if (subClose > subOpen) {
                        currentDeltaOBV += syncedVol * multiplier;
                    } else {
                        currentDeltaOBV -= syncedVol * multiplier;
                    }
                } else {
                    // ELSE (Doji) -> Logika Perbandingan Close Sebelumnya
                    let prevCloseForDoji = null;

                    if (idx > 0) {
                        // Ambil close dari sub-candle sebelumnya dalam grup yang sama
                        prevCloseForDoji = subCandlesInRange[idx - 1].close;
                    } else if (i > 0) {
                        // Jika ini sub-candle pertama, ambil close dari candle utama sebelumnya
                        prevCloseForDoji = mainCandles[i - 1].close;
                    }

                    if (prevCloseForDoji !== null) {
                        if (subClose > prevCloseForDoji) {
                            currentDeltaOBV += syncedVol;
                        } else if (subClose < prevCloseForDoji) {
                            currentDeltaOBV -= syncedVol;
                        }
                    }
                }
            });

            runningNetOBV += currentDeltaOBV;

            console.log(
                `[${ticker}] ${convertTimestamp(currentCandle.timestamp)} | ` +
                `Vol Utama: ${currentCandle.volume.toLocaleString()} | ` +
                `Delta: ${currentDeltaOBV.toFixed(2)} | ` +
                `Net: ${runningNetOBV.toFixed(2)} | ` +
                `Scale: ${scaleFactor.toFixed(3)}`
            );
          
            historyData.push({ ...currentCandle, timestamp: convertTimestamp(currentCandle.timestamp), deltaOBV: currentDeltaOBV, netOBV: runningNetOBV });
        }

        const minNetOBV_all = Math.min(...historyData.map(d => d.netOBV));
        historyData.forEach(d => {
            d.netOBV = d.netOBV - minNetOBV_all;
        });
        runningNetOBV = runningNetOBV - minNetOBV_all;

        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0) {
            if (historyData.length > backdayInt) historyData.splice(-backdayInt);
        }

        const latestCandle = historyData[historyData.length - 1];
        const previousCandle = historyData[historyData.length - 2];

        let gapValue = historyData.length >= 2 ? latestCandle.open / previousCandle.close : 0;
        let maxClose = 0, volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avgLRS = 0;
        let currentDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        
        const PERIOD = (interval === "1h") ? 35 : 25;
        const avgCount = Math.floor((PERIOD + 1) / 2);
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 1;
       
        if (historyData.length > MIN_REQUIRED_DATA) {
            maxClose = calculateMaxClose(historyData.slice(0, -1), PERIOD);
            volatilityRatio = calculateVolatilityRatio(historyData.slice(0, -OFFSET), PERIOD);

            const arrayLRS = [];
            const endIdx = historyData.length - OFFSET;
            for (let t = endIdx - 1; t >= endIdx - avgCount; t--) {
                const windowCloses = historyData
                    .slice(t - PERIOD + 1, t + 1)
                    .map(d => d.close);
                if (windowCloses.length === PERIOD) {
                    const lrsValue = calculateLRS(windowCloses, PERIOD);
                    arrayLRS.push(lrsValue);
                }
            }
          
            avgLRS = arrayLRS.length > 0 ? Math.abs(calculateAverage(arrayLRS)) : 0;

            const allVolumes = historyData.map(d => d.volume);
            const maVolume = calculateMA(allVolumes.slice(0, -1), PERIOD);
            //const maxPrevVolume = Math.max(...allVolumes.slice(-PERIOD - 1, -1));
            const currentVolume = allVolumes[allVolumes.length - 1];
    
            volSpikeRatio = maVolume === 0 ? 0 : currentVolume / maVolume;
            const ma3 = calculateMA(allVolumes.slice(0, -1), 3);
            const ma10 = calculateMA(allVolumes.slice(0, -4), 10);
            avgVol = ma10 === 0 ? 0 : ma3 / ma10;

            const allNetOBV = historyData.map(d => d.netOBV);
            currentDeltaOBV_val = latestCandle.deltaOBV;
            currentNetOBV_val = latestCandle.netOBV;
            
            const maNetOBV = calculateMA(allNetOBV.slice(0, -1), PERIOD);
            const stdevOBV = calculateSTDEV(allNetOBV.slice(0, -1), PERIOD);
            avgNetOBV = stdevOBV !== 0 ? (currentNetOBV_val - maNetOBV) / stdevOBV : 0;
            
            const subsetNetOBV = allNetOBV.slice(-PERIOD - 1, -1);
            const maxNetOBV_subset = Math.max(...subsetNetOBV);
            const minNetOBV_subset = Math.min(...subsetNetOBV);
            strengthNetOBV = (maxNetOBV_subset - minNetOBV_subset) !== 0 
                ? (currentNetOBV_val - minNetOBV_subset) / (maxNetOBV_subset - minNetOBV_subset) 
                : 0;
        }

        return {
            status: "Sukses", ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(4)),
            avgVol: Number(avgVol.toFixed(4)),
            volatilityRatio: Number(volatilityRatio.toFixed(4)),
            lrs: Number(avgLRS.toFixed(4)),
            lastData: latestCandle,
            gapValue: Number(gapValue.toFixed(4)),
            maxClose: Number(maxClose.toFixed(2)),
            currentDeltaOBV: Number(currentDeltaOBV_val.toFixed(2)),
            currentNetOBV: Number(currentNetOBV_val.toFixed(2)),
            avgNetOBV: Number(avgNetOBV.toFixed(4)),
            strengthNetOBV: Number(strengthNetOBV.toFixed(4))
        };
    } catch (error) {
        return { ticker, status: "Error", message: error.message };
    }
}

module.exports = async (req, res) => {
  const { tickers, ticker, interval, range, backday } = req.method === 'POST' ? req.body : req.query;
  const tickerList = Array.isArray(tickers) ? tickers : [ticker];
  const results = await Promise.all(tickerList.map(t => processSingleTicker(t, interval, range, backday)));
  res.status(200).json(req.method === 'POST' ? { results } : results[0]);
};
