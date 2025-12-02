// api/analyze.js
// Fungsi Serverless Vercel untuk memproses data saham dari Yahoo Finance

// Mengimpor library fetch (Pastikan sudah diinstal: npm install node-fetch)
// Catatan: Di Vercel/Node.js modern, Anda mungkin bisa menggunakan fetch bawaan tanpa impor.
const fetch = require('node-fetch');

// Mengimpor fungsi perhitungan dari file logika bisnis
// Asumsikan stockAnalysis.js berada satu level di atas (di root)
const { 
  calculateATR, 
  calculateMAVolume, 
  calculateATRRatio, 
  calculateVolumeRatio 
} = require('../stockAnalysis'); 

// --- Konstanta Analisis ---
const ATR_SHORT_PERIOD = 14;
const ATR_LONG_PERIOD = 100;
const VOLUME_MA_PERIOD = 20;
const HISTORY_DAYS = 30; // Minimal 100 hari + buffer

/**
 * Endpoint utama Serverless Function Vercel.
 */
module.exports = async (req, res) => {
  // 1. Ambil Ticker dari Query Parameter GAS
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const formattedTicker = ticker.toUpperCase().includes('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=1d&range=${HISTORY_DAYS}d`;

  try {
    // 2. Fetch Data dari Yahoo Finance
    const apiResponse = await fetch(url);
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return res.status(404).json({ error: `Data tidak ditemukan untuk ticker ${formattedTicker}.` });
    }

    // 3. Parsing dan Persiapan Data
    const indicators = result.indicators.quote[0];
    const lastPrice = result.meta?.regularMarketPrice || 0;
    
    // Susun data OHLCV menjadi array of objects yang mudah diproses
    const historyData = result.timestamp.map((ts, i) => ({
      timestamp: ts * 1000,
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i]
    })).filter(d => d.close !== null); // Bersihkan data null

    const volumeArray = historyData.map(d => d.volume);

    // Variabel hasil default
    let atrRatio = 0;
    let volumeRatio = 0;

    // 4. Perhitungan Indikator (Jika data cukup)
    if (historyData.length >= HISTORY_DAYS) {
        
        // A. Perhitungan ATR
        const atr14 = calculateATR(historyData, ATR_SHORT_PERIOD);
        const atr100 = calculateATR(historyData, ATR_LONG_PERIOD);
        atrRatio = calculateATRRatio(atr14, atr100);

        // B. Perhitungan Volume Spike
        const currentVolume = volumeArray[volumeArray.length - 1]; // Volume Hari Terakhir
        const maVolume20 = calculateMAVolume(volumeArray, VOLUME_MA_PERIOD);
        volumeRatio = calculateVolumeRatio(currentVolume, maVolume20);

    } else {
        // Jika data tidak cukup, Vercel tetap mengembalikan 200 dengan status peringatan
        return res.status(200).json({ 
            status: "Data tidak cukup", 
            ticker: formattedTicker,
            lastPrice: lastPrice, 
            atrRatio: 0, 
            volumeRatio: 0,
            timestamp: new Date().toISOString()
        });
    }

    // 5. Kembalikan Hasil Sukses
    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      lastPrice: lastPrice,
      atrRatio: atrRatio,
      volumeRatio: volumeRatio,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data server internal.', ticker: formattedTicker });
  }
};
