const fetch = require('node-fetch');
const { 
  calculateMAVolume, 
  calculateVolumeRatio,
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

// --- Konstanta UTC+8 ---
const UTC_OFFSET_SECONDS = 8 * 60 * 60; 

// --- Fungsi Helper Timestamp ---
function convertUnixTimestampToUTC8String(unixTimestampSeconds) {
    if (typeof unixTimestampSeconds !== 'number' || unixTimestampSeconds <= 0) {
        return '';
    }
    // Manipulasi agar tampil seolah-olah UTC+8 di string GMT
    const adjustedTimestampSeconds = unixTimestampSeconds + UTC_OFFSET_SECONDS;
    const dateObject = new Date(adjustedTimestampSeconds * 1000);
    return dateObject.toUTCString().replace('GMT', 'UTC+8'); // Opsional: Ganti label GMT agar tidak bingung
}

module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  const range = req.query.range || '30d'; // Pastikan range cukup panjang untuk PERIOD 16
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
    const timestamp = result.timestamp;

    // Filter data yang valid saja (kadang Yahoo memberikan null di tengah data)
    const historyData = timestamp.map((ts, i) => ({
      timestamp: convertUnixTimestampToUTC8String(ts), 
      open: indicators.open[i],
      high: indicators.high[i],
      low: indicators.low[i],
      close: indicators.close[i],
      volume: indicators.volume[i] || 0 
    })).filter(d => d.close !== null && d.close !== undefined);

    let volSpikeRatio = 0;
    let volatilityRatio = 0;

    // PERBAIKAN 1: Ambil candle terakhir dengan index -1
    const latestCandle = historyData[historyData.length - 1]; 

    // console.log(`Last Data Check:`, latestCandle);

    const PERIOD = 16;
    
    // Pastikan data cukup (Period + 1 candle hari ini)
    if (historyData.length > PERIOD) {
        
        // 1. Hitung Volatilitas (Menggunakan data array object langsung)
        // Fungsi ini di stockAnalysis memotong candle terakhir, jadi aman kirim historyData full
        volatilityRatio = calculateVolatilityRatio(historyData, PERIOD);

        // 2. Hitung MA Volume
        const volumeArray = historyData.map(d => d.volume);
        
        // Fungsi ini di stockAnalysis memotong candle terakhir (current), menghitung rata-rata N sebelumnya
        const maVolume16 = calculateMAVolume(volumeArray, PERIOD);
        
        // 3. Hitung Spike Ratio
        // PERBAIKAN 2: Ambil volume terakhir dengan index yang benar
        const currentVolumeForSpike = volumeArray[volumeArray.length - 1]; 
        
        volSpikeRatio = calculateVolumeRatio(currentVolumeForSpike, maVolume16);
    } 

    res.status(200).json({
      status: "Sukses",
      ticker: formattedTicker,
      volSpikeRatio: parseFloat(volSpikeRatio.toFixed(3)),      
      volatilityRatio: parseFloat(volatilityRatio.toFixed(3)), 
      lastDayData: latestCandle, 
      timestampInfo: {
          note: "Timestamp displayed is converted to UTC+8",
          serverTime: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error("Vercel Error:", error);
    res.status(500).json({ error: 'Gagal memproses data.', details: error.message });
  }
};
