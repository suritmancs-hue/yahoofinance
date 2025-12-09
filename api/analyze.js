const fetch = require('node-fetch');
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

// --- Fungsi Helper untuk Konversi Timestamp ke String (Dibutuhkan di Vercel) ---
/**
 * Mengkonversi Unix Timestamp (dalam detik) menjadi string waktu UTC yang terformat.
 * @param {number} unixTimestampSeconds - Unix Timestamp dalam detik (10 digit).
 * @returns {string} Waktu dalam format UTC.
 */
function convertUnixTimestampToUTCString(unixTimestampSeconds) {
    if (typeof unixTimestampSeconds !== 'number' || unixTimestampSeconds <= 0) {
        return '';
    }
    const unixTimestampMilliseconds = unixTimestampSeconds * 1000;
    const dateObject = new Date(unixTimestampMilliseconds);
    
    // Menggunakan toLocaleString dengan UTC timezone untuk format yang konsisten dan mudah dibaca
    return dateObject.toLocaleString('en-US', { 
        timeZone: 'UTC', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false 
    });
}
// ----------------------------------------------------------------------------------

module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  const range = req.query.range || '30d';
  const interval = req.query.interval || '1d';
  
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const formattedTicker = ticker.toUpperCase().includes('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=${interval}&range=${range}`;

  try {
    const apiResponse = await fetch(url);
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    if (!result || !result.indicators.quote[0].close) {
      return res.status(404).json({ status: `Data tidak ditemukan untuk ticker ${formattedTicker}.` });
    }

    const indicators = result.indicators.quote[0];
    const historyData = result.timestamp.map((ts, i) => ({
      // 🛑 Timestamp dikonversi menjadi STRING UTC yang terformat di sini
      timestamp: convertUnixTimestampToUTCString(ts), 
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i] || 0 // Fallback ke 0
    })).filter(d => d.close !== null);

    let volSpikeRatio = 0;
    let volatilityRatio = 0;
    const latestCandle = historyData[historyData.length - 1]; // Candle N

    // --- STRATEGI N-1 PERMANEN ---
    // Potong candle terakhir (N). stableHistory = data 0 hingga N-1.
    const stableHistory = historyData.slice(0, historyData.length - 1);
    const usingNMinusOne = true; 

    const PERIOD = 16;
    if (stableHistory.length > PERIOD) {
        const volumeArray = stableHistory.map(d => d.volume);

        // Candle yang digunakan untuk perbandingan adalah candle terakhir dari stableHistory (yaitu N-1)
        const currentVolumeForSpike = volumeArray[volumeArray.length - 1]; 
        
        // 1. Hitung Volatilitas 
        volatilityRatio = calculateVolatilityRatio(stableHistory, PERIOD);

        // 2. Hitung MA Volume
        const maVolume16 = calculateMAVolume(volumeArray, PERIOD);
        
        // 3. Hitung Spike Ratio
        volSpikeRatio = calculateVolumeRatio(currentVolumeForSpike, maVolume16);
        
    } else {
        // Jika data tidak cukup, kembalikan 0 dan gunakan latestCandle
    }

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestCandle, // Harga terbaru (N) dengan timestamp string
      timestampInfo: {
          usingNMinusOne: usingNMinusOne
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
