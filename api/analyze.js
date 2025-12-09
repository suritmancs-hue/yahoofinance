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
    const latestCandle = historyData[historyData.length - 1];

    // --- LOGIKA PENENTUAN STABILITAS CANDLE ---
    let stableHistory = [];
    let currentVolumeForSpike = 0;
    let usingNMinusOne = false;
    
    // Asumsi: Intraday adalah interval yang mengandung 'm' (menit) atau 'h' (jam)
    const isIntraday = interval.includes('m') || interval.includes('h'); 

    if (isIntraday) {
        // Pengecekan menit hanya relevan untuk intraday (candle berjalan)
        const lastDate = new Date(latestCandle.timestamp);
        const lastMinute = lastDate.getUTCMinutes();
        
        if (lastMinute !== 0) {
            // Menit tidak 00. Gunakan N-1 untuk kalkulasi.
            stableHistory = historyData.slice(0, historyData.length - 1);
            currentVolumeForSpike = stableHistory[stableHistory.length - 1].volume; // Volume N-1
            usingNMinusOne = true;
        } else {
            // Menit tepat 00. Gunakan data sampai candle terakhir (N).
            stableHistory = historyData;
            currentVolumeForSpike = latestCandle.volume; // Volume N
            usingNMinusOne = false;
        }
    } else {
        // Interval '1d' (Harian). Selalu gunakan candle N karena data dianggap tertutup.
        stableHistory = historyData;
        currentVolumeForSpike = latestCandle.volume; // Volume N
        usingNMinusOne = false;
    }

    // --- PERHITUNGAN ---
    const PERIOD = 16;
    if (stableHistory.length > PERIOD) {
        const volumeArray = stableHistory.map(d => d.volume);

        // 1. Hitung Volatilitas (Berdasarkan data yang sudah diputuskan stabil)
        volatilityRatio = calculateVolatilityRatio(stableHistory, PERIOD);

        // 2. Hitung MA Volume (Menggunakan data historis dari stableHistory)
        const maVolume16 = calculateMAVolume(volumeArray, PERIOD);
        
        // 3. Hitung Spike Ratio
        volSpikeRatio = calculateVolumeRatio(currentVolumeForSpike, maVolume16);
        
    }

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: volSpikeRatio,     
      volatilityRatio: volatilityRatio, 
      lastDayData: latestCandle, // Selalu kembalikan harga running terakhir ke spreadsheet
      timestampInfo: {
          lastMinute: isIntraday ? new Date(latestCandle.timestamp).getUTCMinutes() : 'N/A',
          usingNMinusOne: usingNMinusOne
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.' });
  }
};
