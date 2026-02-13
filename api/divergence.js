/**
 * analis_1d.js
 */
const { 
  calculateMA, calculateVolatilityRatio, calculateLRS, calculateATRP, calculateRange, 
  calculateAverage, calculateSTDEV, 
  calculateMFI, calculateRSI, calculateADX, calculateDivergence
} = require('../stockAnalysis');

const OFFSET = 1;
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

    let mainRange = '1mo';
    let subRange = '30d';

    try {
        const mainRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${mainRange}`);
        const mainData = await mainRes.json();
        // 1. Cek jika API mengembalikan objek error spesifik
        if (mainData.chart?.error) {
            return { 
                ticker, 
                status: "Error", 
                message: `Yahoo API: ${mainData.chart.error.description}` 
            };
        }
        // 2. Cek jika result kosong (sering terjadi jika ticker salah/delisted)
        if (!mainData.chart?.result) {
            return { ticker, status: "Error", message: "Ticker not found or delisted" };
        }
      
        const mainResult = mainData?.chart?.result?.[0];
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
      
        // --- PENGECEKAN SYARAT AWAL (Setelah Potong Backday) ---
        const n = mainCandles.length;
        const currentCandle = mainCandles[n - 1];

        const subRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subinterval}&range=${subRange}`);
        const subData = await subRes.json();
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
        
        // --- 2. Sinkronisasi subCandles (Truncate Logic) ---
        // --- 2. Sinkronisasi subCandles (Interval-Aware Truncate Logic) ---
        if (mainCandles.length > 0) {
            const lastMainCandle = mainCandles[mainCandles.length - 1];
            const lastMainTs = lastMainCandle.timestamp; // Timestamp murni (UTC)

            /**
             * Menentukan durasi interval dalam detik.
             * 1d = 86400s, 4h = 14400s, 1h = 3600s, dst.
             */
            let intervalSeconds = 86400; // Default 1d
            if (interval === '4h') intervalSeconds = 4 * 3600;
            else if (interval === '1h') intervalSeconds = 3600;
            else if (interval === '90m') intervalSeconds = 90 * 60;
            else if (interval === '60m') intervalSeconds = 3600;
            // Tambahkan interval lain jika diperlukan

            // Batas akhir adalah timestamp main candle terakhir + durasi interval - 1 detik
            const endOfInterval = lastMainTs + intervalSeconds - 1;

            // Buang subCandles yang sudah masuk ke "masa depan" (melewati durasi candle utama terakhir)
            subCandles = subCandles.filter(s => s.timestamp <= endOfInterval);
        }

        // --- LANJUT KE PERHITUNGAN
        const historyData = [];
        let runningNetOBV = 0;

        const getIntervalSeconds = (inv) => {
            const num = parseInt(inv);
            if (inv.endsWith('m')) return num * 60;
            if (inv.endsWith('h')) return num * 3600;
            if (inv.endsWith('d')) return num * 86400;
            return 86400; // Default 1 hari
        };
        
        const mainIntervalSec = getIntervalSeconds(interval);

        for (let i = 0; i < mainCandles.length; i++) {
            const currentCandle = mainCandles[i];
            
            // Start adalah timestamp candle (misal 10:00)
            const startOfInterval = currentCandle.timestamp; 
            // End adalah 13:59:59 jika interval 4h
            const endOfInterval   = startOfInterval + mainIntervalSec - 1;
        
            // Filter sub-candle 5m yang berada di dalam rentang 10:00 - 13:59:59
            const subCandlesInRange = subCandles.filter(sub => {
                return sub.timestamp >= startOfInterval && sub.timestamp <= endOfInterval;
            });
        
            const totalSubVolume = subCandlesInRange.reduce((acc, curr) => acc + (curr.volume || 0), 0);
            const scaleFactor = (totalSubVolume > 0 && currentCandle.volume > 0) ? currentCandle.volume / totalSubVolume : 1;
        
            let currentDeltaOBV = 0;
            subCandlesInRange.forEach((sub, idx) => {
                const syncedVol = (sub.volume || 0) * scaleFactor;
                const range = sub.high - sub.low;
            
                let currentDelta = 0;
                if (sub.close !== sub.open) {
                    const intensity = Math.abs(sub.close - sub.open) / Math.max(1, range);
                    currentDelta = (sub.close > sub.open) ? syncedVol * intensity : -syncedVol * intensity;
                } else {
                    let prevClose = (idx > 0) ? subCandlesInRange[idx - 1].close : ((i > 0) ? mainCandles[i - 1].close : sub.open);
                    currentDelta = (sub.close >= prevClose) ? syncedVol : -syncedVol;
                }
                currentDeltaOBV += currentDelta;
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
        const rawNetValues = historyData.map(d => d.netOBV);
        const gMin = Math.min(...rawNetValues);
        const normNetOBV = rawNetValues.map(v => v - gMin);
        historyData.forEach((d, i) => {
            d.netOBV = normNetOBV[i];
        });

        for (let i = 0; i < historyData.length; i++) {
            // Kita butuh minimal data sebanyak periode (misal 14) untuk menghitung
            if (i >= 14) {
                // Ambil potongan data dari awal sampai baris ke-i
                const windowData = historyData.slice(0, i + 1);
                
                // Hitung indikator untuk potongan data tersebut
                // Asumsi: fungsi-fungsi ini mengembalikan array, kita ambil elemen terakhirnya
                const rsiResult = calculateRSI(windowData, 14);
                const mfiResult = calculateMFI(windowData, 14);
                const adxResult = calculateADX(windowData, 14);

                // Masukkan ke dalam map historyData
                historyData[i].rsi = Array.isArray(rsiResult) ? rsiResult[rsiResult.length - 1] : rsiResult;
                historyData[i].mfi = Array.isArray(mfiResult) ? mfiResult[mfiResult.length - 1] : mfiResult;
                historyData[i].adx = Array.isArray(adxResult) ? adxResult[adxResult.length - 1] : adxResult;
            } else {
                // Jika data belum cukup 14, beri nilai null
                historyData[i].rsi = null;
                historyData[i].mfi = null;
                historyData[i].adx = null;
            }
        }

        const latestCandle = historyData[n - 1];
        let currentDeltaOBV_val = 0, prevDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        let divergence = '-';
        
        const PERIOD = 25;
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 1; // Penjaga agar slice tidak out of bounds

        if (n > MIN_REQUIRED_DATA) {
            // Mengambil histori dengan membuang data terakhir (n-1)
            const sliceStart = n - (PERIOD + 1);
            const sliceEnd = n - 1;
            const historySlice = normNetOBV.slice(sliceStart, sliceEnd);

            currentDeltaOBV_val = historyData[n - 1].deltaOBV;
            prevDeltaOBV_val = historyData[n - 2].deltaOBV;
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

            const arrayRSI = historyData.map(d => d.rsi);
            const signalTrend0 = calculateDivergence(historyData, arrayRSI, 25);
            const signalTrend1 = calculateDivergence(historyData.slice(0,-1), arrayRSI.slice(0,-1), 25);
            const signalTrend2 = calculateDivergence(historyData.slice(0,-2), arrayRSI.slice(0,-2), 25);
          
            const currentRSI = historyData[n - 1].rsi;
            const prevRSI = historyData[n - 2].rsi;
            const currentMFI = historyData[n - 1].mfi;
            const prevMFI = historyData[n - 2].mfi;
            const currentADX = historyData[n - 1].adx;
            const prevADX = historyData[n - 2].adx;

            const isDivergence =
                        latestCandle.volume > 500000 &&
                        (currentRSI <50 || prevRSI < 50) && (currentMFI > 50 || currentADX > 50) &&
                        currentDeltaOBV_val > 0 && prevDeltaOBV_val > 0 &&
                        (signalTrend1 !== "BULLISH DIVERGENCE" || signalTrend2 !== "BULLISH DIVERGENCE") && signalTrend0 === "BULLISH DIVERGENCE";

            if (isDivergence) divergence = 'Bullish Divergence';
        }

        return {
            status: "Sukses", ticker,
            lastData: latestCandle,
            currentDeltaOBV: Number(currentDeltaOBV_val.toFixed(2)),
            currentNetOBV: Number(currentNetOBV_val.toFixed(2)),
            avgNetOBV: Number(avgNetOBV.toFixed(2)),
            strengthNetOBV: Number(strengthNetOBV.toFixed(2)),
            divergence
        };
    } catch (error) {
        return { ticker, status: "Error", message: error.message };
    }
}

module.exports = async (req, res) => {
    try {
        const { tickers, ticker, interval, subinterval, backday } = req.method === 'POST' ? req.body : req.query;
        
        // Menentukan list ticker
        const tickerList = Array.isArray(tickers) ? tickers : (ticker ? [ticker] : []);
        
        if (tickerList.length === 0) {
            return res.status(400).json({ status: "Error", message: "No tickers provided" });
        }

        // PERBAIKAN: Promise.all di sini untuk menjalankan processSingleTicker secara paralel
        const results = await Promise.all(
            tickerList.map(t => processSingleTicker(t, interval, subinterval, backday))
        );

        res.status(200).json(req.method === 'POST' ? { results } : results[0]);
    } catch (err) {
        res.status(500).json({ status: "Error", message: err.message });
    }
};
