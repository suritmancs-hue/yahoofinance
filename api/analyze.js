const fetch = require('node-fetch');
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

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
      timestamp: ts * 1000,
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i] || 0
    })).filter(d => d.close !== null);

    let volSpikeRatio = 0;
    let volatilityRatio = 0;
    const latestCandle = historyData[historyData.length - 1]; // Tetap ambil N untuk info harga

    // --- STRATEGI N-1 PERMANEN ---
    // Potong candle terakhir (N). stableHistory = data 0 hingga N-1.
    const stableHistory = historyData.slice(0, historyData.length - 1);
    const usingNMinusOne = true; // Selalu N-1

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
      lastDayData: latestCandle, // Harga selalu terbaru (N)
      timestampInfo: {
          usingNMinusOne: usingNMinusOne
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
