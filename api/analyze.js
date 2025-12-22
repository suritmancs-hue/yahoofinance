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
    let subInterval = '1h';
    if (interval === '1h') subInterval = '15m';
    if (interval === '1d') subInterval = '1h';

    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    url.searchParams.set('interval', interval || '1d');
    url.searchParams.set('range', range || '3mo');

    try {
        // Fetch Data Utama dan Data OBV secara Paralel
        const [mainRes, subRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`),
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${subInterval}&range=${range}`)
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
        }));

        // 4. Proses Main-Candles dan Map OBV
        const mainTimestamps = mainResult.timestamp;
        const mainQuote = mainResult.indicators.quote[0];
   
        const historyData = [];
        let runningNetOBV = 0;

        for (let i = 0; i < mainTimestamps.length; i++) {
            const currentMainTs = mainTimestamps[i];
            const nextMainTs = mainTimestamps[i + 1] || Infinity;
            const dailyVolumeTarget = mainQuote.volume[i] || 0; 
        
            // 1. Ambil sub-candles yang masuk dalam rentang candle utama ini
            const subCandlesToday = subCandles.filter(o => o.timestamp >= currentMainTs && o.timestamp < nextMainTs);
            
            // 2. Hitung total volume sub-candle
            const totalSubVolumeToday = subCandlesToday.reduce((acc, curr) => acc + (curr.volume || 0), 0);
            
            // 3. Hitung Scale Factor (Sinkronisasi Volume)
            const dailyScaleFactor = (totalSubVolumeToday > 0 && dailyVolumeTarget > 0) 
                ? dailyVolumeTarget / totalSubVolumeToday 
                : 1;

            console.log(`subCandlesToday : ${subCandlesToday}`);
            console.log(`totalSubVolumeToday : ${totalSubVolumeToday}`);
            console.log(`dailyScaleFactor : ${dailyScaleFactor}`);
        
            // 4. Hitung Delta OBV sesuai rumus Excel Anda
            let dailyDeltaOBV = 0;
            subCandlesToday.forEach(sub => {
                const open = sub.open ?? sub.close;
                const close = sub.close;
                const high = sub.high ?? Math.max(open, close);
                const low  = sub.low  ?? Math.min(open, close);
                const volume = sub.volume || 0;

                // Rumus Excel: ABS(AC117-Z117) -> Selisih absolut Close - Open (Body)
                const bodyAbs = Math.abs(close - open);
                
                // Rumus Excel: MAX(1, (AA117-AB117)) -> Range High-Low, minimal 1
                const hlRange = Math.max(1, high - low);

                let subDelta = 0;
                
                // Rumus Excel: IF(AC117 > Z117, ... , IF(AC117 < Z117, ... , 0))
                if (close > open) {
                    // Close > Open (Candle Hijau)
                    subDelta = volume * (bodyAbs / hlRange);
                } else if (close < open) {
                    // Close < Open (Candle Merah)
                    subDelta = -volume * (bodyAbs / hlRange);
                } else {
                    // Close == Open
                    subDelta = 0;
                }

                // Barulah dikalikan dengan dailyScaleFactor untuk sinkronisasi harian
                dailyDeltaOBV += subDelta * dailyScaleFactor;
            });
        
            // 5. Update Akumulasi OBV
            runningNetOBV += dailyDeltaOBV;
        
            // Push ke historyData hanya jika ada harga close yang valid
            if (typeof mainQuote.close[i] === 'number') {
                historyData.push({
                    timestamp: convertTimestamp(currentMainTs),
                    open: mainQuote.open[i],
                    high: mainQuote.high[i],
                    low: mainQuote.low[i],
                    close: mainQuote.close[i],
                    volume: dailyVolumeTarget,
                    deltaOBV: dailyDeltaOBV,
                    netOBV: runningNetOBV
                });
            }
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
    
      
        let maxClose = 0, volSpikeRatio = 0, avgVol = 0, volatilityRatio = 0, avglrs = 0;
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
            avgLRS = calculateAverageLRS(historyData, PERIOD, OFFSET);

            
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
            spikeNetOBV = (currentNetOBV - prevNetOBV) / Math.abs(prevNetOBV) * 100;
          
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
