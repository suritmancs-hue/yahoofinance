// api/analyze.js
// Fungsi Serverless Vercel yang telah diperbarui untuk 3 indikator

const fetch = require('node-fetch');

// Mengimpor fungsi perhitungan, termasuk yang baru
const { 
  calculateATR, 
  calculateMAVolume, 
  calculateATRRatio, 
  calculateVolumeRatio,
  calculateCloseRangeRatio // <--- IMPOR FUNGSI BARU
} = require('../stockAnalysis'); 

// --- Konstanta Analisis (Diasumsikan Anda sudah menguranginya ke 30 hari) ---
const ATR_SHORT_PERIOD = 5;      
const ATR_LONG_PERIOD = 15;      
const VOLUME_MA_PERIOD = 10;     
const HISTORY_DAYS = 30;         

/**
 * Endpoint utama Serverless Function Vercel.
 */
module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const formattedTicker = ticker.toUpperCase().includes('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
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
    const lastPrice = result.meta?.regularMarketPrice || 0;
    
    const historyData = result.timestamp.map((ts, i) => ({
      timestamp: ts * 1000,
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i]
    })).filter(d => d.close !== null); 

    const volumeArray = historyData.map(d => d.volume);

    let atrRatio = 0;
    let volumeRatio = 0;
    let closeRangeRatio = 0; // <--- VARIABEL BARU

    // 4. Perhitungan Indikator (Jika data cukup)
    if (historyData.length >= HISTORY_DAYS) {
        
        // A. Perhitungan ATR dan Rasio
        const atr5 = calculateATR(historyData, ATR_SHORT_PERIOD);
        const atr15 = calculateATR(historyData, ATR_LONG_PERIOD);
        atrRatio = calculateATRRatio(atr5, atr15);

        // B. Perhitungan Volume Spike dan Rasio
        const currentVolume = volumeArray[volumeArray.length - 1]; 
        const maVolume10 = calculateMAVolume(volumeArray, VOLUME_MA_PERIOD);
        volumeRatio = calculateVolumeRatio(currentVolume, maVolume10);

        // C. Perhitungan Close vs. High Range (TEKANAN BELI)
        const lastDayData = historyData[historyData.length - 1];
        const high = lastDayData.high;
        const low = lastDayData.low;
        const close = lastDayData.close;
        closeRangeRatio = calculateCloseRangeRatio(high, low, close); // <--- PERHITUNGAN BARU

    } else {
        // Data tidak cukup
        return res.status(200).json({ 
            status: "Data tidak cukup", 
            ticker: formattedTicker,
            lastPrice: lastPrice, 
            atrRatio: 0, 
            volumeRatio: 0,
            closeRangeRatio: 0, // <--- TAMBAHKAN DI SINI JUGA
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
      closeRangeRatio: closeRangeRatio, // <--- TAMBAHKAN NILAI BARU KE RESPONSE
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data server internal.', ticker: formattedTicker });
  }
};
