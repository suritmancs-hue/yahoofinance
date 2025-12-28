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
            return isValidPrice && dateObj.getUTCSeconds() === 0;
        });

        const mainQuoteRaw = mainResult.indicators.quote[0];
        const mainCandles = mainResult.timestamp.map((ts, i) => ({
            timestamp: ts,
            open: mainQuoteRaw.open[i],
            high: mainQuoteRaw.high[i],
            low: mainQuoteRaw.low[i],
            close: mainQuoteRaw.close[i],
            volume: mainQuoteRaw.volume[i] || 0
        })).filter((d) => typeof d.close === 'number' && !isNaN(d.close));

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
                
                if (subClose !== subOpen) {
                    const bodyAbs = Math.abs(subClose - subOpen);
                    const hlRange = Math.max(1, (subHigh - subLow));
                    const multiplier = bodyAbs / hlRange;
                    currentDeltaOBV += syncedVol * multiplier * (subClose > subOpen ? 1 : -1);
                } else {
                    let prevClose = idx > 0 ? subCandlesInRange[idx - 1].close : (i > 0 ? mainCandles[i - 1].close : null);
                    if (prevClose !== null) {
                        if (subClose > prevClose) currentDeltaOBV += syncedVol;
                        else if (subClose < prevClose) currentDeltaOBV -= syncedVol;
                    }
                }
            });

            runningNetOBV += currentDeltaOBV;
            historyData.push({ 
                ...currentCandle, 
                timestamp: convertTimestamp(currentCandle.timestamp), 
                deltaOBV: currentDeltaOBV, 
                netOBV: runningNetOBV 
            });
        }

        // --- Normalisasi Global Net OBV (Sesuai Teknik gMin di AD) ---
        const gMin = Math.min(...historyData.map(d => d.netOBV));
        const normNetOBV = historyData.map(d => d.netOBV - gMin);

        console.log(`normNetOBV : ${normNetOBV}`);

        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0) {
            if (normNetOBV.length > backdayInt) {
                normNetOBV.splice(-backdayInt);
                historyData.splice(-backdayInt);
            }
        }

        const n = normNetOBV.length;
        const latestCandle = historyData[n - 1];
        
        let volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avgLRS = 0;
        let currentDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        
        const PERIOD = (interval === "1h") ? 35 : 25;
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 1; // Penjaga agar slice tidak out of bounds

        if (n > MIN_REQUIRED_DATA) {
            // --- TEKNIK SLICING IDENTIK DENGAN AD ---
            // Mengambil histori (L103:L127) dengan membuang data terakhir (n-1)
            const sliceStart = n - (PERIOD + 1);
            const sliceEnd = n - 1;
            const historySlice = normNetOBV.slice(sliceStart, sliceEnd);

            currentDeltaOBV_val = historyData[n - 1].deltaOBV;
            currentNetOBV_val   = normNetOBV[n - 1]; // L128

            // Statistik Histori
            const mean = calculateAverage(historySlice);
            const variance = historySlice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / historySlice.length;
            const stdev = Math.sqrt(variance);
            const minH = Math.min(...historySlice);
            const maxH = Math.max(...historySlice);

            // Perhitungan Indikator (Identik AD)
            avgNetOBV = stdev !== 0 ? (currentNetOBV_val - mean) / stdev : 0;
            strengthNetOBV = (maxH - minH) === 0 ? 0 : (currentNetOBV_val - minH) / (maxH - minH);

            // --- Indikator Lainnya ---
            maxClose = calculateMaxClose(historyData.slice(0, -1), PERIOD);
            volatilityRatio = calculateVolatilityRatio(historyData.slice(0, -OFFSET), PERIOD);

            const arrayLRS = [];
            const lrsEnd = n - OFFSET;
            const avgCount = Math.floor((PERIOD + 1) / 2);
            for (let t = lrsEnd - 1; t >= lrsEnd - avgCount; t--) {
                const windowCloses = historyData.slice(t - PERIOD + 1, t + 1).map(d => d.close);
                if (windowCloses.length === PERIOD) arrayLRS.push(calculateLRS(windowCloses, PERIOD));
            }
            avgLRS = arrayLRS.length > 0 ? Math.abs(calculateAverage(arrayLRS)) : 0;

            const allVolumes = historyData.map(d => d.volume);
            const maVolume = calculateMA(allVolumes.slice(0, -1), PERIOD);
            volSpikeRatio = maVolume === 0 ? 0 : allVolumes[n - 1] / maVolume;
            
            const ma3 = calculateMA(allVolumes.slice(0, -1), 3);
            const ma10 = calculateMA(allVolumes.slice(0, -4), 10);
            avgVol = ma10 === 0 ? 0 : ma3 / ma10;
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
