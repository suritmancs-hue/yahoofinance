const fetch = require('node-fetch');
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

// --- Konstanta UTC+8 ---
const UTC_OFFSET_SECONDS = 8 * 60 * 60; // 8 jam * 60 menit * 60 detik = 28800 detik

// --- Fungsi Helper untuk Konversi Timestamp ke String (Dibutuhkan di Vercel) ---
/**
 * Mengkonversi Unix Timestamp (dalam detik) ke UTC+8, lalu format string GMT.
 * Format target: 'Thu, 04 Dec 2025 04:00:00 GMT'
 * @param {number} unixTimestampSeconds - Unix Timestamp dalam detik (10 digit).
 * @returns {string} Waktu yang sudah di-offset (UTC+8) dalam format string GMT.
 */
function convertUnixTimestampToUTC8String(unixTimestampSeconds) {
    if (typeof unixTimestampSeconds !== 'number' || unixTimestampSeconds <= 0) {
        return '';
    }
    
    // 1. Tambahkan Offset 8 Jam ke Timestamp (dalam detik)
    const adjustedTimestampSeconds = unixTimestampSeconds + UTC_OFFSET_SECONDS;

    // Konversi ke milidetik (13 digit)
    const unixTimestampMilliseconds = adjustedTimestampSeconds * 1000;
    const dateObject = new Date(unixTimestampMilliseconds);
    
    // 2. Gunakan toUTCString() yang menghasilkan format string yang diinginkan dengan label GMT di akhir.
    return dateObject.toUTCString(); 
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
      // Timestamp dikonversi menjadi STRING UTC+8 yang terformat
      timestamp: convertUnixTimestampToUTC8String(ts), 
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i] || 0 // Fallback ke 0
    })).filter(d => d.close !== null);

    let volSpikeRatio = 0;
    let volatilityRatio = 0;
    const latestCandle = historyData[historyData.length - 1]; // Candle N (Hanya untuk harga/timestamp terbaru)

    console.log(`historyData (raw): ${JSON.stringify(historyData)}`);
    
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
        
    } 

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestCandle, 
      timestampInfo: {
          usingNMinusOne: usingNMinusOne
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
