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
      volume: indicators.volume[i] || 0 // Fallback ke 0 jika volume null
    })).filter(d => d.close !== null);

    let volSpikeRatio = 0;
    let volatilityRatio = 0;
    const latestPriceData = historyData[historyData.length - 1]; // Tetap ambil harga terbaru untuk output

    // --- STRATEGI N-1 ---
    // Pastikan data cukup (Periode 16 + buffer 1 candle)
    if (historyData.length > 17) {
        
        // 1. Potong candle terakhir agar kalkulasi menggunakan data stabil
        const stableHistory = historyData.slice(0, historyData.length - 1);
        const volumeArray = stableHistory.map(d => d.volume);

        // 2. Hitung Volatilitas (Berdasarkan data 0 sampai N-1)
        volatilityRatio = calculateVolatilityRatio(stableHistory, 16);

        // 3. Hitung Volume Spike (Volume N-1 dibanding MA 16 data sebelumnya)
        const currentVolume = volumeArray[volumeArray.length - 1]; // Ini adalah Volume N-1
        const maVolume16 = calculateMAVolume(volumeArray, 16);
        volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16);
        
    } else {
        return res.status(200).json({ 
            status: "Data historis tidak mencukupi", 
            ticker: formattedTicker,
            volSpikeRatio: 0, 
            volatilityRatio: 0, 
            lastDayData: latestPriceData 
        });
    }

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestPriceData, 
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
