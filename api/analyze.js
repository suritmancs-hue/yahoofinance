/**
 * analyze.js
 */
const { 
    calculateMA, 
    calculateVolatilityRatio, 
    calculateAverage, 
    calculateMaxClose, 
    calculateSTDEV,
    calculateLRS 
} = require('../stockAnalysis');

const UTC_OFFSET_SECONDS = 8 * 60 * 60; 
const OFFSET = 2;

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

        // --- MAPPING DATA CANDLE ---
        const mapCandles = (result, quoteIdx = 0) => {
            const q = result.indicators.quote[0];
            return result.timestamp.map((ts, i) => ({
                timestamp: ts,
                open: q.open[i],
                high: q.high[i],
                low: q.low[i],
                close: q.close[i],
                volume: q.volume[i] || 0
            })).filter(d => {
                const isValidPrice = typeof d.close === 'number' && !isNaN(d.close);
                const dateObj = new Date(d.timestamp * 1000);
                const mins = dateObj.getUTCMinutes();
                const secs = dateObj.getUTCSeconds();
                return isValidPrice && secs === 0 && (mins % 15 === 0);
            });
        };

        const subCandles = mapCandles(subResult);
        const mainCandles = mapCandles(mainResult);

        // --- OBV HYBRID LOGIC ---
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
                const syncedVol = (sub.volume || 0) * scaleFactor;
                
                if (subClose !== subOpen) {
                    const bodyAbs = Math.abs(subClose - subOpen);
                    const hlRange = Math.max(1, (sub.high - sub.low));
                    const multiplier = bodyAbs / hlRange;
                    currentDeltaOBV += (subClose > subOpen ? 1 : -1) * syncedVol * multiplier;
                } else {
                    let prevClose = idx > 0 ? subCandlesInRange[idx-1].close : (i > 0 ? mainCandles[i-1].close : null);
                    if (prevClose !== null && subClose !== prevClose) {
                        currentDeltaOBV += (subClose > prevClose ? 1 : -1) * syncedVol;
                    }
                }
            });

            runningNetOBV += currentDeltaOBV;
            historyData.push({ ...currentCandle, timestamp: convertTimestamp(currentCandle.timestamp), deltaOBV: currentDeltaOBV, netOBV: runningNetOBV });
        }

        // --- NORMALIZE OBV ---
        const minNetOBV_all = Math.min(...historyData.map(d => d.netOBV));
        historyData.forEach(d => d.netOBV -= minNetOBV_all);

        // --- BACKDAY LOGIC ---
        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0 && historyData.length > backdayInt) {
            historyData.splice(-backdayInt);
        }

        // --- FINAL CALCULATIONS ---
        const latestCandle = historyData[historyData.length - 1];
        const PERIOD = (interval === "1h") ? 35 : 25;
        const avgCount = Math.floor((PERIOD + 1) / 2); // Penting: Sama dengan Excel (13 untuk 25)
        
        let avgLRS = 0, avgVol = 0, volSpikeRatio = 0, volatilityRatio = 0;

        if (historyData.length > (PERIOD + avgCount + OFFSET)) {
            // 1. LRS Logic (Identik Excel)
            const arrayLRS = [];
            const endIdxLRS = historyData.length - OFFSET;
            for (let t = endIdxLRS - 1; t >= endIdxLRS - avgCount; t--) {
                const windowCloses = historyData.slice(t - PERIOD + 1, t + 1).map(d => d.close);
                if (windowCloses.length === PERIOD) {
                    arrayLRS.push(calculateLRS(windowCloses, PERIOD));
                }
            }
            avgLRS = Math.abs(calculateAverage(arrayLRS));

            // 2. Volume & Volatility
            const allVolumes = historyData.map(d => d.volume);
            const currentVolume = allVolumes[allVolumes.length - 1];
            const maVolume = calculateMA(allVolumes.slice(0, -1), PERIOD);
            
            volSpikeRatio = maVolume === 0 ? 0 : currentVolume / maVolume;
            avgVol = calculateMA(allVolumes.slice(0, -1), 3) / calculateMA(allVolumes.slice(0, -4), 10);
            volatilityRatio = calculateVolatilityRatio(historyData.slice(0, -OFFSET), PERIOD);
        }

        return {
            status: "Sukses",
            ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(4)),
            avgVol: Number(avgVol.toFixed(4)),
            volatilityRatio: Number(volatilityRatio.toFixed(4)),
            lrs: Number(avgLRS.toFixed(4)),
            lastData: latestCandle
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
