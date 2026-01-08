/**
 * analis_1D.js
 */
const { 
  calculateMA, calculateVolatilityRatio, calculateLRS,
  calculateAverage, calculateMinClose, calculateSTDEV
} = require('../stockAnalysis');

const OFFSET = 3;
const TZ_OFFSET = 8 * 3600; //UTC+8

function toIDX(ts) {
  return Number(ts) + TZ_OFFSET;
}

function convertTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    const date = new Date((unixSeconds + TZ_OFFSET) * 1000);
    return date.toUTCString().replace('GMT', 'WITA'); 
}

async function processSingleTicker(ticker, interval, subinterval, backday = 0) {
    if (!ticker) return { ticker, status: "Error", message: "No Ticker" };

    let mainRange = '3mo';
    let subRange = '3mo';

    try {
        const [mainRes, subRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${mainRange}`),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subinterval}&range=${subRange}`)
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
        })).filter((d) => typeof d.close === 'number' && !isNaN(d.close) && d.volume !== 0);

        // --- 1. Potong mainCandles berdasarkan backday ---
        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0 && mainCandles.length > backdayInt) {
            mainCandles.splice(-backdayInt);
        }
        
        // --- 2. Sinkronisasi subCandles (Truncate Logic) ---
        if (mainCandles.length > 0) {
            const lastMainCandle = mainCandles[mainCandles.length - 1];
            const lastMainTs = toIDX(lastMainCandle.timestamp);
        
                /**
                 * Logika 1D: Batas akhir adalah akhir hari dari main candle terakhir.
                 * Kita buang subCandles yang sudah berganti tanggal dari main candle terakhir.
                 */
                const d = new Date(lastMainTs * 1000);
                
                // Buat batas akhir hari (pukul 23:59:59) untuk tanggal tersebut
                const endOfDay = Math.floor(lastMainTs / 86400) * 86400 + 86399;
        
                // Kita hanya membuang data yang SUDAH MELEWATI hari tersebut.
                // Data dari awal histori hingga akhir hari terakhir tetap aman.
                subCandles = subCandles.filter(s => s.timestamp <= endOfDay);
        }

        // --- PENGECEKAN SYARAT AWAL (Setelah Potong Backday) ---
        const n = mainCandles.length;
        const currentCandle = mainCandles[n - 1];
        const previousCandle = mainCandles[n - 2];

        // --- LANJUT KE PERHITUNGAN
        const historyData = [];
        let runningNetOBV = 0;
        const SECONDS_IN_DAY = 86400;
        
        for (let i = 0; i < mainCandles.length; i++) {
            const currentCandle = mainCandles[i];
        
            // 1. Normalisasi timestamp Main Candle ke 00:00:00 hari itu
            // Caranya: Ambil timestamp murni, kurangi sisa detiknya dalam satu hari
            const mainTs = toIDX(currentCandle.timestamp);          
            const startOfMainDay = Math.floor(mainTs / 86400) * 86400;
            const endOfMainDay   = startOfMainDay + 86399;
        
            // 2. Filter subCandles yang jatuh pada rentang hari yang sama
            const subCandlesInRange = subCandles.filter(sub => {
                const subTs = toIDX(sub.timestamp);
                return subTs >= startOfMainDay && subTs <= endOfMainDay;
            });
        
            // 3. Hitung Volume & Scale Factor tetap seperti biasa
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
            
                    if (subClose > prevClose) {
                        currentDelta = syncedVol;
                    } else if (subClose < prevClose) {
                        currentDelta = -syncedVol;
                    } else {
                        currentDelta = 0;
                    }
                }
                currentDeltaOBV += currentDelta;
                //console.log(`currentDelta : ${sub.timestamp} ${currentDelta}`);
                //console.log(`currentDeltaOBV : ${currentDeltaOBV}`);
            });

            runningNetOBV += currentDeltaOBV;
            //console.log(`currentDeltaOBV : ${currentDeltaOBV}`);
          
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

        //console.log(`normNetOBV : ${normNetOBV}`);

        const latestCandle = historyData[n - 1];
        let volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avgLRS = 0;
        let currentDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        let minClose =0;
        
        const PERIOD = 25;
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 1; // Penjaga agar slice tidak out of bounds

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

            // Perhitungan Indikator (Identik AD)
            avgNetOBV = stdev !== 0 ? (currentNetOBV_val - mean) / stdev : 0;
            strengthNetOBV = (maxH - minH) === 0 ? 0 : (currentNetOBV_val - minH) / (maxH - minH);

            // --- Indikator Lainnya ---
            minClose = calculateMinClose(historyData.slice(0, -1), PERIOD);
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
            
            const ma3 = calculateMA(allVolumes, 3);
            const ma10 = calculateMA(allVolumes.slice(0, -3), 10);
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
            minClose: Number(minClose.toFixed(2)),
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
  const { tickers, ticker, interval, subinterval, backday } = req.method === 'POST' ? req.body : req.query;
  const tickerList = Array.isArray(tickers) ? tickers : [ticker];
  const results = await Promise.all(tickerList.map(t => processSingleTicker(t, interval, subinterval, backday)));
  res.status(200).json(req.method === 'POST' ? { results } : results[0]);
};
