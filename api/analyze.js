// api/analyze.js
// Fungsi Serverless Vercel yang telah diperbarui untuk mengembalikan data OHLCV

const fetch = require('node-fetch');

// Mengimpor fungsi perhitungan
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

// --- Konstanta Analisis ---
const VOLUME_MA_PERIOD = 16;     
const VOLATILITY_PERIOD = 16;    
const HISTORY_DAYS = 30;         // Jumlah hari data historis yang diambil (untuk perhitungan)

/**
 * Endpoint utama Serverless Function Vercel.
 */
module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const formattedTicker = ticker.toUpperCase().includes('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
  // Memastikan mengambil data yang cukup untuk perhitungan Volatility (16 hari)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=1d&range=${HISTORY_DAYS}d`;

  try {
    const apiResponse = await fetch(url);
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: `Data tidak ditemukan untuk ticker ${formattedTicker}.` });
    }

    // Parsing dan Persiapan Data
    const indicators = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    const historyData = timestamps.map((ts, i) => ({
      timestamp: ts * 1000, // Konversi ke milisekon
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i]
    })).filter(d => d.close !== null); 

    const volumeArray = historyData.map(d => d.volume);

    let volSpikeRatio = 0;           
    let volatilityRatio = 0;         
    let lastDayData = {};

    // 4. Perhitungan Indikator (Jika data cukup)
    if (historyData.length >= HISTORY_DAYS) {
        
        // Data Hari Terakhir (untuk kolom B-G di Sheets)
        lastDayData = historyData[historyData.length - 1];

        // A. Perhitungan Volatility (Max/Min 16)
        volatilityRatio = calculateVolatilityRatio(historyData, VOLATILITY_PERIOD); 

        // B. Perhitungan Volume Spike (Vol sekarang / MA 16)
        const currentVolume = lastDayData.volume;
        const maVolume16 = calculateMAVolume(volumeArray, VOLUME_MA_PERIOD);
        volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16); 
        
    } else {
        // Data tidak cukup
        return res.status(200).json({ 
            status: "Data tidak cukup", 
            ticker: formattedTicker,
            volSpikeRatio: 0,
            volatilityRatio: 0,
            lastDayData: {timestamp: new Date().getTime(), open: 'N/A', high: 'N/A', low: 'N/A', close: 'N/A', volume: 'N/A'},
            timestamp: new Date().toISOString()
        });
    }

    // 5. Kembalikan Hasil Sukses (MENGEMBALIKAN DATA HARGA HARI TERAKHIR)
    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: lastDayData, // <-- MENGEMBALIKAN OHLCV HARI TERAKHIR
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data server internal.', ticker: formattedTicker });
  }
};
