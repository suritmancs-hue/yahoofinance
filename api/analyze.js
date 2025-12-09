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
    
    // 2. Gunakan toLocaleString dengan timeZone: 'UTC' agar semua komponennya disajikan dalam UTC
    // dan tambahkan label 'GMT' secara manual (jika toUTCString tidak memberikan format yang presisi)
    
    const options = {
        weekday: 'short', // Thu
        year: 'numeric',  // 2025
        month: 'short',   // Dec
        day: '2-digit',   // 04
        hour: '2-digit',  // 04
        minute: '2-digit',// 00
        second: '2-digit',// 00
        timeZone: 'UTC',
        hour12: false // 24-jam format
    };
    
    // Hasil format: "Thu, 04 Dec 2025 04:00:00"
    const formattedDatePart = dateObject.toLocaleString('en-US', options).replace(/,/, ''); 

    // Mencocokkan dengan format target: 'Thu, 04 Dec 2025 04:00:00 GMT'
    // Kita harus memastikan format akhir benar-benar sesuai. toUTCString() seringkali yang terdekat.
    // Jika toUTCString() di lingkungan Vercel menghasilkan: "Thu, 04 Dec 2025 04:00:00 GMT"
    // kita akan pertahankan toUTCString karena paling ringan.
    
    return dateObject.toUTCString(); 
}
// ----------------------------------------------------------------------------------

module.exports = async (req, res) => {
  // ... (Sisa logika analyze.js tetap sama) ...

  try {
    // ... (Parsing data OHLCV) ...
    
    const indicators = result.indicators.quote[0];
    const historyData = result.timestamp.map((ts, i) => ({
      // 🛑 Menggunakan fungsi konversi baru
      timestamp: convertUnixTimestampToUTC8String(ts), 
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i] || 0
    })).filter(d => d.close !== null);

    // ... (Sisa logika N-1 dan perhitungan tetap sama) ...

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestCandle, 
      timestampInfo: {
          usingNMinusOne: true // Permanen
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
