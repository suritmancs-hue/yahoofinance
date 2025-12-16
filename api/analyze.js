// analyze.js

const { 
  calculateMAVolume, 
  calculateVolumeRatio, 
  calculateVolatilityRatio 
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

    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    url.searchParams.set('interval', interval || '1d');
    url.searchParams.set('range', range || '1mo');

    try {
        const apiResponse = await fetch(url.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!apiResponse.ok) return { ticker, status: "Error", message: `Yahoo ${apiResponse.status}` };

        const data = await apiResponse.json();
        const result = data?.chart?.result?.[0];

        if (!result || !result.timestamp || !result.indicators.quote[0].close) {
            return { ticker, status: "Not Found", message: "Data Empty" };
        }

        const { timestamp } = result;
        const { open, high, low, close, volume } = result.indicators.quote[0];
        const dataLength = timestamp.length;

        // --- FILTERING DATA (Menit 00 & Valid Price) ---
        const historyData = [];
        for (let i = 0; i < dataLength; i++) {
            const c = close[i];
            // 1. Cek harga valid
            if (typeof c !== 'number' || isNaN(c)) continue;
            
            const tsStr = convertTimestamp(timestamp[i]);
            
            // 2. Filter Menit :00 (String check)
            if (!tsStr.includes(":00:00")) continue;

            historyData.push({
                timestamp: tsStr,
                open: open[i], high: high[i], low: low[i], close: c, volume: volume[i] || 0
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

        // --- PERHITUNGAN GAP ---
        let gapValue = 0;
        if (historyData.length >= 2) {
            const previousCandle = historyData[historyData.length - 2];
            const prevClose = previousCandle.close;
            const currentOpen = latestCandle.open;
            gapValue = currentOpen/prevClose;
        }
        
        let volSpikeRatio = 0;
        let avgVol = 0;
        let volatilityRatio = 0;

        // Tentukan Period berdasarkan Interval
        const PERIOD = (interval === "1h") ? 25 : 20;
        const MIN_REQUIRED_DATA = PERIOD + OFFSET + 2;

        if (historyData.length > MIN_REQUIRED_DATA) {
            historyDataVolatil = historyData.slice(0, -OFFSET);
            volatilityRatio = calculateVolatilityRatio(historyDataVolatil, PERIOD);
            
            // Optimasi: Ambil slice terakhir saja untuk MA Volume
            const relevantHistory = historyData.slice(-(PERIOD + 1));
            const relevantVolume = relevantHistory.map(d => d.volume);
            
            const maVolume = calculateMAVolume(relevantVolume, PERIOD);
            const currentVolume = relevantVolume[relevantVolume.length - 1];
            const historicalOnly = relevantVolume.slice(0, -1);

            const maxPrevVolume = Math.max(...historicalOnly);
            
            // Safety check
            if (maxPrevVolume > 0) {
                const ratioVsMax = currentVolume / maxPrevVolume;
                // Ambang batas spike (1.5x)
                if (ratioVsMax >= 1.5) {
                    volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume);
                } else {
                    volSpikeRatio = 0;
                }
            } else {
                volSpikeRatio = 0;
            }
          
            // Hitung Average Volume antar MA
            sliceVol_1 = relevantVolume.slice(0, 3);
            avgVol_1 = calculateMAVolume(sliceVol_1, 3);
            sliceVol_2 = relevantVolume.slice(4, 5 + PERIOD);
            avgVol_2 = calculateMAVolume(sliceVol_2, PERIOD);
            avgVol = avgVol_1 / avgVol_2;
          
        }

        return {
            status: "Sukses",
            ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(3)),
            avgVol: Number(avgVol.toFixed(3)),
            volatilityRatio: Number(volatilityRatio.toFixed(3)),
            lastData: latestCandle,
            gapValue: Number(gapValue.toFixed(4)),
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
