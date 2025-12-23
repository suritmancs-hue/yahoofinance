// analyze.js

const { 
  calculateAverage,
  calculateMA, 
  calculateVolumeRatio, 
  calculateVolatilityRatio,
  calculateLRS,
  calculateAverageLRS,
  calculateMaxClose,
  calculateOBVArray,
  calculateSTDEV
} = require('../stockAnalysis'); 


const UTC_OFFSET_SECONDS = 8 * 60 * 60; 
const OFFSET = 2;

// Helper Timestamp
function convertTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    const date = new Date((unixSeconds + UTC_OFFSET_SECONDS) * 1000);
    return date.toUTCString().replace('GMT', 'WITA'); 
}

// --- LOGIC PEMROSESAN 1 TICKER ---
// Tambahkan parameter 'backday' (default 0 jika tidak diisi)
async function processSingleTicker(ticker, interval, range, backday = 0) {
    if (!ticker) return { ticker, status: "Error", message: "No Ticker" };

    // 1. Tentukan subInterval dan Default Range secara otomatis
    let subInterval = '1h';
    let defaultRange = range || '3mo'; // Default umum

    if (interval === '1h') {
          subInterval = '15m';
          defaultRange = range || '10d'; // Set 20 hari untuk 1H (15m)
    } else if (interval === '1d') {
          subInterval = '1h';
          defaultRange = range || '2mo'; // Set 3 bulan untuk 1D (1h)
    }
  
    try {
        // Fetch Data Utama dan Data OBV secara Paralel
        const [mainRes, subRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${defaultRange}`),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subInterval}&range=${defaultRange}`)
        ]);

        const mainData = await mainRes.json();
        const subData = await subRes.json();

        const mainResult = mainData?.chart?.result?.[0];
        const subResult = subData?.chart?.result?.[0];

        if (!mainResult || !subResult) return { ticker, status: "Error", message: "Data Empty" };

        // 3. Proses Sub-Candles untuk OBV
        const subTimestamps = subResult.timestamp;
        const subQuote = subResult.indicators.quote[0];
        const subCandles = subTimestamps.map((ts, i) => ({
          timestamp: ts,
          open: subQuote.open[i],
          high: subQuote.high[i],
          low: subQuote.low[i],
          close: subQuote.close[i],
          volume: subQuote.volume[i] || 0
        })).filter((d) => {
            // A. Cek apakah harga valid
            const isValidPrice = typeof d.close === 'number' && !isNaN(d.close);
            // B. Cek apakah detik valid = 00
            const dateObj = new Date(d.timestamp * 1000);
            const seconds = dateObj.getUTCSeconds();
            const isValidSecond = seconds === 0;
            // C. Cek apakah Menit Valid
            const minutes = dateObj.getUTCMinutes();
            const isValidMinute = minutes === 0 || minutes === 15 || minutes === 30 || minutes === 45;
            // D. Gabungkan kedua syarat
            return isValidPrice && isValidSecond && isValidMinute;
        });

      
        // 4. Proses Main-Candles dan Map OBV
        const mainTimestamps = mainResult.timestamp;
        const mainQuoteRaw = mainResult.indicators.quote[0];

        // Filter array mainCandles agar sinkron dengan menit bursa
        const mainCandles = mainTimestamps.map((ts, i) => ({
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
            // Meloloskan detik dan menit standar bursa
            const isValidSecond = seconds === 0;
            const isValidMinute = mins === 0 || mins === 15 || mins === 30 || mins === 45;
            return isValidPrice && isValidSecond && isValidMinute;
        });
   
        const historyData = [];
        let runningNetOBV = 0;

        for (let i = 0; i < mainCandles.length; i++) {
            const currentCandle = mainCandles[i]; // Gunakan nama variabel yang jelas
            const nextCandle = mainCandles[i + 1];
            
            // Menentukan batas waktu (Universal)
            // intervalStep dihitung dari selisih timestamp asli agar akurat menangani hari libur
            const intervalStep = (mainCandles.length > 1) 
                ? (mainCandles[1].timestamp - mainCandles[0].timestamp) 
                : 3600;
          
            const nextMainTs = nextCandle ? nextCandle.timestamp : (currentCandle.timestamp + intervalStep);
            
            // Filter sub-candles yang masuk dalam rentang candle utama ini
            const subCandlesInRange = subCandles.filter(sub => 
                sub.timestamp >= currentCandle.timestamp && sub.timestamp < nextMainTs
            );
            
            const totalSubVolume = subCandlesInRange.reduce((acc, curr) => acc + (curr.volume || 0), 0);
            const scaleFactor = (totalSubVolume > 0 && currentCandle.volume > 0) ? currentCandle.volume / totalSubVolume : 1;
        
            let currentDeltaOBV = 0;
            subCandlesInRange.forEach(sub => {
                const subOpen = sub.open ?? sub.close;
                const subClose = sub.close;
                const bodyAbs = Math.abs(subClose - subOpen);
                const hlRange = Math.max(1, sub.high - sub.low);
                const syncedVol = sub.volume * scaleFactor;
                
                if (subClose > subOpen) {
                    currentDeltaOBV += syncedVol * (bodyAbs / hlRange);
                } else if (subClose < subOpen) {
                    currentDeltaOBV -= syncedVol * (bodyAbs / hlRange);
                } else {
                    // Logika Doji: Bandingkan dengan sub-candle sebelumnya dalam range yang sama
                    const prevSub = subCandlesInRange[idx - 1];
                    if (prevSub) {
                        if (subClose > prevSub.close) currentDeltaOBV += syncedVol;
                        else if (subClose < prevSub.close) currentDeltaOBV -= syncedVol;
                    }
                }
            });

            runningNetOBV += currentDeltaOBV;

            //console.log(`[${ticker}] ${convertTimestamp(currentCandle.timestamp)} | Main Vol: ${currentCandle.volume} | SubVol Sum: ${totalSubVolume.toFixed(0)} | Scale: ${scaleFactor.toFixed(4)} | Delta OBV: ${currentDeltaOBV.toFixed(2)} | Net OBV: ${runningNetOBV.toFixed(2)}`);
                           
            historyData.push({
                timestamp: convertTimestamp(currentCandle.timestamp),
                open: currentCandle.open,
                high: currentCandle.high,
                low: currentCandle.low,
                close: currentCandle.close,
                volume: currentCandle.volume,
                deltaOBV: currentDeltaOBV,
                netOBV: runningNetOBV
            });
        }

      
        if (historyData.length === 0) return { ticker, status: "Not Found", message: "Filtered Empty" };

        // --- FITUR BACKDAY (LOGIKA BARU) ---
        // Jika backday diisi (misal: 2), kita buang 2 candle terakhir.
        // Candle ke-3 dari belakang akan menjadi 'latestCandle' simulasi.
        const backdayInt = parseInt(backday);
        if (!isNaN(backdayInt) && backdayInt > 0) {
            // Cek apakah sisa data cukup setelah dipotong
            if (historyData.length <= backdayInt) {
                 return { ticker, status: "Error", message: `Data kurang untuk backtest ${backdayInt} hari` };
            }
            // Buang N data terakhir
            // splice(-N) menghapus N elemen dari belakang array
            historyData.splice(-backdayInt);
        }

        // Ambil candle terakhir (setelah dipotong backday)
        const latestCandle = historyData[historyData.length - 1];
        const previousCandle = historyData[historyData.length - 2];

        // --- PERHITUNGAN GAP ---
        let gapValue = 0;
        if (historyData.length >= 2) {
            const prevClose = previousCandle.close;
            const currentOpen = latestCandle.open;
            gapValue = currentOpen/prevClose;
        }
    
      
        let maxClose = 0, volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avgLRS = 0;
        let currentDeltaOBV = 0, currentNetOBV = 0, avgNetOBV = 0, spikeNetOBV = 0;
        // Tentukan Period berdasarkan Interval
        const PERIOD = (interval === "1h") ? 26 : 20;
        const MIN_REQUIRED_DATA = 2 * PERIOD + OFFSET + 2;
       
        //Hitung
        if (historyData.length > MIN_REQUIRED_DATA) {
            const historyForMax = historyData.slice(0, -1); //tidak termasuk candle tutup terakhir
            maxClose = calculateMaxClose(historyForMax, PERIOD);
              
            const historyDataVolatil = historyData.slice(0, -OFFSET);
            volatilityRatio = calculateVolatilityRatio(historyDataVolatil, PERIOD);
            avgLRS = calculateAverageLRS(historyData, PERIOD / 2, OFFSET);

            
            // Optimasi: Ambil slice terakhir saja untuk MA Volume
            const allVolumes = historyData.map(d => d.volume);
            const currentVolume = allVolumes[allVolumes.length - 1];
            const historicalVolumes = allVolumes.slice(0, -1);
            const maVolume = calculateMA(historicalVolumes, PERIOD);

            const relevantHistoricalVol = historicalVolumes.slice(-PERIOD);
            const maxPrevVolume = Math.max(...relevantHistoricalVol);
            
            // Safety check
            if (maxPrevVolume > 0) {
                //const ratioVsMax = currentVolume / maxPrevVolume;
                // Ambang batas spike (1.5x)
                if (currentVolume >= maxPrevVolume) {
                    volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume);
                } else {
                    volSpikeRatio = 0;
                }
            } else {
                volSpikeRatio = 0;
            }
          
            // Hitung Average Volume antar MA3 dan MA10
            const maShort = calculateMA(allVolumes, 3);
            const volumesForLong = allVolumes.slice(0, -3);
            const maLong = calculateMA(volumesForLong, 10)
          
            if (maLong > 0) {
                avgVol = maShort / maLong;
            }  else {
                avgVol = 0;
            }

            
            //current Delta OBV
            const allDeltatOBV = historyData.map(d => d.deltaOBV);
            currentDeltaOBV = allDeltatOBV[allDeltatOBV.length - 1];
          
            //Hitung Average Net OBV
            const allNetOBV = historyData.map(d => d.netOBV);
            currentNetOBV = allNetOBV[allNetOBV.length - 1];
            const historicalNetOBV = allNetOBV.slice(0, -1);
            const maNetOBV = calculateMA(historicalNetOBV, PERIOD);
            const stdevOBV = calculateSTDEV(historicalNetOBV, PERIOD);
            avgNetOBV = stdevOBV !== 0 ? (currentNetOBV - maNetOBV) / stdevOBV : 0;

            //Net OBV Spike
            const prevNetOBV = allNetOBV[allNetOBV.length - 2];
            spikeNetOBV = (prevNetOBV !== 0) ? ((currentNetOBV - prevNetOBV) / Math.abs(prevNetOBV) * 100) : 0;
          
        }

        return {
            status: "Sukses",
            ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(4)),
            avgVol: Number(avgVol.toFixed(4)),
            volatilityRatio: Number(volatilityRatio.toFixed(4)),
            lrs: Number(avgLRS.toFixed(4)),
            lastData: latestCandle,
            gapValue: Number(gapValue.toFixed(4)),
            maxClose: Number(maxClose.toFixed(2)),
            currentDeltaOBV: Number(currentDeltaOBV.toFixed(4)),
            currentNetOBV: Number(currentNetOBV.toFixed(4)),
            avgNetOBV: Number(avgNetOBV.toFixed(4)),
            spikeNetOBV: Number(spikeNetOBV.toFixed(4)),
            backtestMode: backdayInt > 0 ? `Mundur ${backdayInt} periode` : "Live" 
        };

    } catch (error) {
        return { ticker, status: "Error", message: error.message };
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
  // Mode BULK (POST)
  if (req.method === 'POST') {
      try {
          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          // Ambil 'backday' dari body JSON
          const { tickers, interval, range, backday } = body;

          if (!tickers || !Array.isArray(tickers)) {
              return res.status(400).json({ error: "Invalid body. 'tickers' array required." });
          }

          // Proses PARALEL (Pass backday ke fungsi)
          const promises = tickers.map(t => processSingleTicker(t, interval, range, backday));
          const results = await Promise.all(promises);

          return res.status(200).json({ results });
      } catch (e) {
          return res.status(500).json({ error: e.message });
      }
  } 
  // Mode SINGLE (GET)
  else {
      // Ambil 'backday' dari URL Query
      const { ticker, interval, range, backday } = req.query;
      const result = await processSingleTicker(ticker, interval, range, backday);
      return res.status(result.status === "Error" ? 500 : 200).json(result);
  }
};
