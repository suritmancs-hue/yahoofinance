/**
 * analis_1D.js
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

    let mainRange = '3mo';
    let subRange = '50d';

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
            
                    if (subClose >= prevClose) {
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
        let volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, currentLRS = 0; currentATRP = 0; currentRange = 0; rangeRasio = 0;
        let currentDeltaOBV_val = 0, currentNetOBV_val = 0, avgNetOBV = 0, strengthNetOBV = 0;
        let maClose = 0;
        let currentMFI = 0, currentRSI = 0, currentADX = 0;
        //let signalTrend = 0;
        
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
            const allCloses = historyData.map(d => d.close);
            maClose = calculateMA(allCloses, 20);
            //volatilityRatio = calculateVolatilityRatio(historyData.slice(0, -OFFSET), PERIOD);
            currentLRS = calculateLRS(historyData, 14);
            currentATRP = calculateATRP(historyData, 14);
            currentRange = calculateRange(historyData, 14);

            const allHighs = historyData.map(d => d.high);
            const allLowes = historyData.map(d => d.low);
            const range5 = (calculateMA(allHighs.slice(0, -1), 5)) - (calculateMA(allLowes.slice(0, -1), 5));
            const range15 = (calculateMA(allHighs.slice(0, -6), 15)) - (calculateMA(allLowes.slice(0, -6), 15));
            rangeRasio = range5 / range15;

            const allVolumes = historyData.map(d => d.volume);
            const maVolume = calculateMA(allVolumes.slice(0, -1), PERIOD);
            volSpikeRatio = maVolume === 0 ? 0 : allVolumes[n - 1] / maVolume;
            
            const ma3 = calculateMA(allVolumes, 3);
            const ma10 = calculateMA(allVolumes.slice(0, -3), 10);
            avgVol = ma10 === 0 ? 0 : ma3 / ma10;
            
            currentMFI = calculateMFI(historyData, 14);
            currentRSI = calculateRSI(historyData, 14);
            currentADX = calculateADX(historyData, 14);
            //currentADX = allADXValues[allADXValues.length - 1];

            //signalTrend = calculateDivergence(historyData, allADXValues, 25);
        }

        return {
            status: "Sukses", ticker,
            lastData: latestCandle,
            volSpikeRatio: Number(volSpikeRatio.toFixed(2)),
            avgVol: Number(avgVol.toFixed(2)),
            lrs: Number(currentLRS.toFixed(2)),
            currentATRP: Number(currentATRP.toFixed(2)),
            currentRange: Number(currentRange.toFixed(2)),
            rangeRasio: Number(rangeRasio.toFixed(2)),
            maClose: Number(maClose.toFixed(2)),
            currentDeltaOBV: Number(currentDeltaOBV_val.toFixed(2)),
            currentNetOBV: Number(currentNetOBV_val.toFixed(2)),
            avgNetOBV: Number(avgNetOBV.toFixed(2)),
            strengthNetOBV: Number(strengthNetOBV.toFixed(2)),
            currentMFI: Number(currentMFI.toFixed(2)),
            currentRSI: Number(currentRSI.toFixed(2)),
            currentADX: Number(currentADX.toFixed(2))
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
