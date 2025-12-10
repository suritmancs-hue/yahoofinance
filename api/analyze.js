// analyze.js

const { 
  calculateMAVolume, 
  calculateVolumeRatio, 
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

const UTC_OFFSET_SECONDS = 8 * 60 * 60; 

// Helper Timestamp
function convertTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    const date = new Date((unixSeconds + UTC_OFFSET_SECONDS) * 1000);
    return date.toUTCString().replace('GMT', 'WITA'); 
}

// --- LOGIC PEMROSESAN 1 TICKER (Dipisah jadi fungsi) ---
async function processSingleTicker(ticker, interval, range) {
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

        const latestCandle = historyData[historyData.length - 1];
        let volSpikeRatio = 0;
        let volatilityRatio = 0;
        const PERIOD = 16;

        if (historyData.length > PERIOD) {
            volatilityRatio = calculateVolatilityRatio(historyData, PERIOD);
            
            // Optimasi: Ambil slice terakhir saja untuk MA Volume
            const relevantHistory = historyData.slice(-(PERIOD + 1));
            const relevantVolume = relevantHistory.map(d => d.volume);
            
            const maVolume16 = calculateMAVolume(relevantVolume, PERIOD);
            const currentVolume = relevantVolume[relevantVolume.length - 1];
            volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16);
        }

        return {
            status: "Sukses",
            ticker,
            volSpikeRatio: Number(volSpikeRatio.toFixed(3)),
            volatilityRatio: Number(volatilityRatio.toFixed(3)),
            lastData: latestCandle
        };

    } catch (error) {
        return { ticker, status: "Error", message: error.message };
    }
}

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
  // Mode BULK (POST) - Hemat Kuota GAS
  if (req.method === 'POST') {
      try {
          const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          const { tickers, interval, range } = body;

          if (!tickers || !Array.isArray(tickers)) {
              return res.status(400).json({ error: "Invalid body. 'tickers' array required." });
          }

          // Proses PARALEL di sisi Server (Vercel)
          // Vercel akan request ke Yahoo secara bersamaan untuk semua ticker di list
          const promises = tickers.map(t => processSingleTicker(t, interval, range));
          const results = await Promise.all(promises);

          return res.status(200).json({ results });
      } catch (e) {
          return res.status(500).json({ error: e.message });
      }
  } 
  // Mode SINGLE (GET) - Untuk testing manual di browser
  else {
      const { ticker, interval, range } = req.query;
      const result = await processSingleTicker(ticker, interval, range);
      return res.status(result.status === "Error" ? 500 : 200).json(result);
  }
};
