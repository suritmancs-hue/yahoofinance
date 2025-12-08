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
    const latestCandle = historyData[historyData.length - 1];

    // --- LOGIKA PENGECEKAN MENIT 00 ---
    const lastDate = new Date(latestCandle.timestamp);
    const lastMinute = lastDate.getUTCMinutes();
    
    let stableHistory = [];
    let currentVolumeForSpike = 0;

    if (lastMinute !== 0) {
        // Jika menit bukan 00 (misal 13:45), data volume belum valid.
        // Gunakan N-1 untuk kalkulasi.
        stableHistory = historyData.slice(0, historyData.length - 1);
        currentVolumeForSpike = stableHistory[stableHistory.length - 1]; // Volume N-1
    } else {
        // Jika menit tepat 00 (misal 14:00), candle baru saja tertutup/tepat jam.
        // Gunakan data sampai candle terakhir (N).
        stableHistory = historyData;
        currentVolumeForSpike = latestCandle.volume; // Volume N
    }

    // --- PERHITUNGAN ---
    if (stableHistory.length > 17) {
        const volumeArray = stableHistory.map(d => d.volume);

        // 1. Hitung Volatilitas (Berdasarkan data yang sudah diputuskan stabil)
        volatilityRatio = calculateVolatilityRatio(stableHistory, 16);

        // 2. Hitung MA Volume (Menggunakan data historis dari stableHistory)
        const maVolume16 = calculateMAVolume(volumeArray, 16);
        
        // 3. Hitung Spike Ratio
        // currentVolumeForSpike diambil berdasarkan kondisi menit di atas
        volSpikeRatio = calculateVolumeRatio(currentVolumeForSpike, maVolume16);
        
    }

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestCandle, // Selalu kembalikan harga running terakhir ke spreadsheet
      timestampInfo: {
          lastMinute: lastMinute,
          usingNMinusOne: (lastMinute !== 0)
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
