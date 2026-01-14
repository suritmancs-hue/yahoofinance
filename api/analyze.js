/**
 * analyze.js
 */
const { 
  calculateMA, calculateVolatilityRatio, calculateLRS,
  calculateAverage, calculateMinClose, calculateSTDEV, calculateOpenClose, calculateMFI
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

    let subInterval = '5m';
    let mainRange = range || '10d';
    let subRange = mainRange;

    try {
        const [mainRes, subRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${mainRange}`),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subInterval}&range=${subRange}`)
        ]);

        const mainData = await mainRes.json();
        const subData = await subRes.json();
        const mainResult = mainData?.chart?.result?.[0];
        const subResult = subData?.chart?.result?.[0];

        if (!mainResult || !subResult) return { ticker, status: "Error", message: "Data Empty" };

        const subQuote = subResult.indicators.quote[0];
        let subCandles = subResult.timestamp.map((ts, i) => ({
          timestamp: ts,
          open: subQuote.open[i],
          high: subQuote.high[i],
          low: subQuote.low[i],
          close: subQuote.close[i],
          volume: subQuote.volume[i] || 0
        })).filter((d) => typeof d.close === 'number' && !isNaN(d.close));

        const mainQuoteRaw = mainResult.indicators.quote[0];
        const mainCandles = mainResult.timestamp.map((ts, i) => ({
            timestamp: ts,
            open: mainQuoteRaw.open[i],
            high: mainQuoteRaw.high[i],
            low: mainQuoteRaw.low[i],
            close: mainQuoteRaw.close[i],
            volume: mainQuoteRaw.volume[i] || 0
        })).filter((d) => typeof d.close === 'number' && !isNaN(d.close));

        // --- 1. Potong mainCandles berdasarkan backday ---
        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0 && mainCandles.length > backdayInt) {
            mainCandles.splice(-backdayInt);
        }
        
        // --- 2. Sinkronisasi subCandles (Truncate Logic) ---
        if (mainCandles.length > 0) {
            const lastMainCandle = mainCandles[mainCandles.length - 1];
            const lastMainTs = lastMainCandle.timestamp;

                /**
                 * Logika 15m: Batas akhir adalah Menit ke-10 (untuk main candle pukul 10.00).
                 * Jadi kita buang semua subCandles yang >= 10.15.
                 */
                const limit15m = lastMainTs + (15 * 60); 
                subCandles = subCandles.filter(s => s.timestamp < limit15m);
        }

        // --- PENGECEKAN SYARAT AWAL (Setelah Potong Backday) ---
        const n = mainCandles.length;
        if (n < 15) {
            return { ticker, status: "Filtered" };
        }
        const currentCandle = mainCandles[n - 1];
        const prevCandle1 = mainCandles[n - 2];
        const prevCandle2 = mainCandles[n - 3];
        const prevCandle3 = mainCandles[n - 4];

        const currentMFI = calculateMFI(mainCandles, 14);
        console.log(`currentMFI : ${currentMFI}`);

        // Syarat: Close > Prev Close DAN Close > Open DAN Volume > 1.000
        const isBullish = currentCandle.close >= currentCandle.open &&    //(currentCandle.close > currentCandle.open) > 1.0125 && (currentCandle.high / currentCandle.low) > 1.015 &&
                  //(currentCandle.close / currentCandle.open) > (prevCandle1.close / prevCandle1.open) &&
                  //(currentCandle.close / currentCandle.open) > (prevCandle2.close / prevCandle2.open) &&
                  //(currentCandle.close / currentCandle.open) > (prevCandle3.close / prevCandle3.open) &&
                  currentCandle.volume > 1000000 &&
                  currentCandle.volume > prevCandle1.volume && currentCandle.volume > prevCandle2.volume && currentCandle.volume > prevCandle3.volume &&
                  currentMFI > 77.5;
        if (!isBullish) {
            return {
                status: "Filtered",
                ticker,
                volSpikeRatio: null,
                avgVol: null,
                volatilityRatio: null,
                lrs: null,
                lastData: {
                    ...currentCandle,
                    timestamp: convertTimestamp(currentCandle.timestamp)
                },
                gapValue: null,
                maxClose: null,
                currentDeltaOBV: null,
                currentNetOBV: null,
                avgNetOBV: null,
                strengthNetOBV: null,
                ocfilter: null
            };
        }

        // --- LANJUT KE PERHITUNGAN
      
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
                const subOpen = sub.open;
                const subHigh = sub.high;
                const subLow = sub.low;
                const subClose = sub.close;
                const syncedVol = (sub.volume || 0) * scaleFactor;
                const range = subHigh - subLow;
            
                let currentDelta = 0;

                if (subClose !== subOpen) {
                    const effectiveRange = Math.max(1, range);
                    const intensity = Math.abs(subClose - subOpen) / effectiveRange;
            
                    if (subClose > subOpen) {
                        currentDelta = syncedVol * intensity;
                    } else {
                        currentDelta = -syncedVol * intensity;
                    }
                } 
                else {
                    let prevClose;
                    if (idx > 0) {
                        prevClose = subCandlesInRange[idx - 1].close;
                    } else {
                        prevClose = (i > 0) ? mainCandles[i - 1].close : subOpen;
                    }
            
                    if (subClose >= prevClose) {
                        currentDelta = syncedVol;
                    } else if (subClose < prevClose) {
                        currentDelta = -syncedVol;
                    } else {
                        currentDelta = 0;
                    }
                }
                currentDeltaOBV += currentDelta;
            });

            runningNetOBV += currentDeltaOBV;
            //console.log(`currentDeltaOBV : ${currentDeltaOBV}`);
            //console.log(`runningNetOBV : ${runningNetOBV}`);
            historyData.push({ 
                ...currentCandle, 
                timestamp: convertTimestamp(currentCandle.timestamp), 
                deltaOBV: currentDeltaOBV, 
                netOBV: runningNetOBV 
            });
        }

        // --- Normalisasi Global Net OBV (Sesuai Teknik gMin di AD) ---
        const rawNetValues = historyData.map(d => d.netOBV);
        const gMin = Math.min(...rawNetValues);
        const normNetOBV = rawNetValues.map(v => v - gMin);
        historyData.forEach((d, i) => {
            d.netOBV = normNetOBV[i];
        });

        const latestCandle = historyData[n - 1];
        let volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avgLRS = 0;
        let currentDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        let maxClose = 0, ocfilter = 0;
        
        const PERIOD = (interval === "15m") ? 35 : 25;
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 1;

        if (n > MIN_REQUIRED_DATA) {
            // Mengambil histori dengan membuang data terakhir (n-1)
            const sliceStart = n - (PERIOD + 1);
            const sliceEnd = n - 1;
            const historySlice = normNetOBV.slice(sliceStart, sliceEnd);

            currentDeltaOBV_val = historyData[n - 1].deltaOBV;
            currentNetOBV_val   = normNetOBV[normNetOBV.length - 1];

            // Statistik Histori
            const mean = calculateAverage(historySlice);
            const variance = historySlice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / historySlice.length;
            const stdev = Math.sqrt(variance);
            const minH = Math.min(...historySlice);
            const maxH = Math.max(...historySlice);

            avgNetOBV = stdev !== 0 ? (currentNetOBV_val - mean) / stdev : 0;
            strengthNetOBV = (maxH - minH) === 0 ? 0 : (currentNetOBV_val - minH) / (maxH - minH);

            // --- Indikator Lainnya ---
            maxClose = calculateMinClose(historyData.slice(0, -1), 5);
            volatilityRatio = calculateVolatilityRatio(historyData.slice(0, -OFFSET), PERIOD);

            const arrayLRS = [];
            const lrsEnd = n - OFFSET;
            const avgCount = Math.floor((PERIOD + 1) / 2);
            for (let t = lrsEnd - 1; t >= lrsEnd - avgCount; t--) {
                const windowCloses = historyData.slice(t - PERIOD + 1, t + 1).map(d => d.close);
                if (windowCloses.length === PERIOD) {
                    const lrsValue = calculateLRS(windowCloses, PERIOD);
                    arrayLRS.push(Math.abs(lrsValue));
                }
            }
            avgLRS = arrayLRS.length > 0 ? calculateAverage(arrayLRS) : 0;

            const allVolumes = historyData.map(d => d.volume);
            const maVolume = calculateMA(allVolumes.slice(0, -1), PERIOD);
            volSpikeRatio = maVolume === 0 ? 0 : allVolumes[n - 1] / maVolume;
            
            const ma5 = calculateMA(allVolumes, 5);
            const ma15 = calculateMA(allVolumes.slice(0, -5), 15);
            avgVol = ma15 === 0 ? 0 : ma5 / ma15;

            ocfilter = calculateOpenClose(historyData.slice(0, -1), 50); // OC FILTER = 50
        }

        return {
            status: "Sukses", ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(4)),
            avgVol: Number(avgVol.toFixed(4)),
            volatilityRatio: Number(volatilityRatio.toFixed(4)),
            lrs: Number(avgLRS.toFixed(4)),
            lastData: latestCandle,
            gapValue: Number((latestCandle.open / historyData[n-2].close).toFixed(4)),
            maxClose: Number(maxClose.toFixed(2)),
            currentDeltaOBV: Number(currentDeltaOBV_val.toFixed(2)),
            currentNetOBV: Number(currentNetOBV_val.toFixed(2)),
            avgNetOBV: Number(avgNetOBV.toFixed(4)),
            strengthNetOBV: Number(strengthNetOBV.toFixed(4)),
            ocfilter: Number(ocfilter.toFixed(0))
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
