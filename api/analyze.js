const fetch = require('node-fetch');

// Import hanya fungsi yang benar-benar digunakan
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

// --- Konstanta Analisis ---
const VOLUME_MA_PERIOD = 16;     
const VOLATILITY_PERIOD = 16;    
const HISTORY_PERIOD = '30d';     //5d
const INTERVAL_PERIOD = '1d';    //1h

/**
 * Endpoint utama Serverless Function Vercel.
 */
module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const formattedTicker = ticker.toUpperCase().includes('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${formattedTicker}?interval=${INTERVAL_PERIOD}&range=${HISTORY_PERIOD}`;

  try {
    const apiResponse = await fetch(url);
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    if (!result || !result.indicators.quote[0].close) {
      return res.status(404).json({ status: `Data tidak ditemukan untuk ticker ${formattedTicker}.` });
    }

    // --- Parsing Data: Cepat dan Bersih ---
    const indicators = result.indicators.quote[0];
    const historyData = result.timestamp.map((ts, i) => ({
      timestamp: ts * 1000,
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i]
    })).filter(d => d.close !== null);  // Filter data yang tidak lengkap
    
    const volumeArray = historyData.map(d => d.volume);

    let volSpikeRatio = 0;           
    let volatilityRatio = 0;         
    let lastDayData = {};

    // 4. Perhitungan Indikator (Pastikan data cukup)
    if (historyData.length > VOLATILITY_PERIOD) { 
        
        lastDayData = historyData[historyData.length - 1];

        // A. Perhitungan Volatility (Max/Min 16 candle sebelumnya)
        volatilityRatio = calculateVolatilityRatio(historyData, VOLATILITY_PERIOD); 

        // B. Perhitungan Volume Spike (Vol candle terakhir / MA 16 candle sebelumnya)
        const currentVolume = lastDayData.volume;
        const maVolume16 = calculateMAVolume(volumeArray, VOLUME_MA_PERIOD);
        volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16); 
        
    } else {
        // Data jam tidak cukup
        return res.status(200).json({ 
            status: "Data jam tidak cukup", 
            ticker: formattedTicker,
            volSpikeRatio: 0, 
            volatilityRatio: 0, 
            lastDayData: {timestamp: new Date().getTime(), open: 'N/A', high: 'N/A', low: 'N/A', close: 'N/A', volume: 'N/A'}, 
        });
    }

    // 5. Kembalikan Hasil Sukses
    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: lastDayData, 
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data server internal.', ticker: formattedTicker });
  }
};
