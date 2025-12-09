// analyze.js:

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
    return dateObject.toUTCString().replace('GMT', 'WITA'); // Opsional: Ganti label GMT agar tidak bingung
}

module.exports = async (req, res) => {
  const ticker = req.query.ticker;
  const range = req.query.range;
  const interval = req.query.interval;
  
  if (!ticker) {
    return res.status(400).json({ error: 'Parameter ticker diperlukan.' });
  }

  const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
  const urlObj = new URL(baseUrl);
  urlObj.searchParams.append('interval', interval); // Otomatis menangani karakter & dan ?
  urlObj.searchParams.append('range', range);

  //Konversi kembali ke string untuk fetch
  const finalUrl = urlObj.toString();

  try {
    const apiResponse = await fetch(finalUrl);
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    if (!result || !result.indicators.quote[0].close) {
      return res.status(404).json({ status: `Data tidak ditemukan untuk ticker ${ticker}.` });
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
    })).filter((d, i) => {
        // A. Cek apakah harga valid
        const isValidPrice = typeof d.close === 'number' && !isNaN(d.close);
        // B. Cek apakah Menit == 00
        const rawTime = timestamp[i];
        const dateObj = new Date(rawTime * 1000);
        const minute = dateObj.getUTCHours();
        const isMinuteZero = minute !== 17 || minute !== 9; 
        // C. Gabungkan syarat
        return isValidPrice && isMinuteZero;

    });

    let volSpikeRatio = 0;
    let volatilityRatio = 0;

    // Ambil candle terakhir
    const latestCandle = historyData[historyData.length - 1]; 

    const PERIOD = 16;
    
    // Pastikan data cukup
    if (historyData.length > PERIOD) {
        
        // 1. Hitung Volatilitas (Menggunakan data array object langsung)
        volatilityRatio = calculateVolatilityRatio(historyData, PERIOD);

        // 2. Hitung MA Volume
        const volumeArray = historyData.map(d => d.volume);        
        const maVolume16 = calculateMAVolume(volumeArray, PERIOD);
        
        // 3. Hitung Spike Ratio
        const currentVolume = volumeArray[volumeArray.length - 1];
        volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16);
    } 

    res.status(200).json({
      status: "Sukses",
      ticker: ticker,
      volSpikeRatio: parseFloat(volSpikeRatio.toFixed(3)),      
      volatilityRatio: parseFloat(volatilityRatio.toFixed(3)), 
      lastData: latestCandle, 
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
