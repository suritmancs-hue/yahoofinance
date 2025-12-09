// analyze.js

// Tidak perlu require module terpisah jika logicnya sedikit, 
// tapi jika ingin tetap modular, pastikan require dilakukan di atas.
const { 
  calculateMAVolume, 
  calculateVolumeRatio, 
  calculateVolatilityRatio 
} = require('../stockAnalysis'); 

const UTC_OFFSET_SECONDS = 8 * 60 * 60; 

// Optimasi Helper Timestamp: Langsung return string tanpa validasi berlebih di awal
// karena data dari Yahoo biasanya konsisten strukturnya.
function convertTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    const date = new Date((unixSeconds + UTC_OFFSET_SECONDS) * 1000);
    // Menggunakan replace regex global lebih cepat untuk format standar
    return date.toUTCString().replace('GMT', 'WITA'); 
}

module.exports = async (req, res) => {
  // Destructuring query langsung
  const { ticker, range, interval } = req.query;
  
  if (!ticker) return res.status(400).json({ error: 'Ticker required.' });

  // Gunakan URL native tanpa variabel perantara yang tidak perlu
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
  url.searchParams.set('interval', interval || '1d'); // Default fallback
  url.searchParams.set('range', range || '1mo');

  try {
    const apiResponse = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // Langsung ambil JSON
    const data = await apiResponse.json();
    const result = data?.chart?.result?.[0];

    // Cek keberadaan data vital (timestamp & close)
    if (!result || !result.timestamp || !result.indicators.quote[0].close) {
      return res.status(404).json({ status: `No data for ${ticker}` });
    }

    const { timestamp } = result;
    const { open, high, low, close, volume } = result.indicators.quote[0];
    const dataLength = timestamp.length;

    // --- OPTIMASI FILTER & MAPPING (Single Loop) ---
    // Daripada map() lalu filter() (2x loop), gunakan reduce() atau loop manual (1x loop)
    // Ini menghemat memori dan CPU time.
    
    const historyData = [];
    
    for (let i = 0; i < dataLength; i++) {
        const c = close[i];
        
        // Cek harga valid
        if (typeof c !== 'number' || isNaN(c)) continue;

        const tsStr = convertTimestamp(timestamp[i]);
        
        // Filter Menit :00 (String check lebih cepat dari Date object parsing)
        if (!tsStr.includes(":00:00")) continue;

        // Push data valid
        historyData.push({
            timestamp: tsStr,
            open: open[i],
            high: high[i],
            low: low[i],
            close: c,
            volume: volume[i] || 0
        });
    }

    // Cek Data Kosong
    if (historyData.length === 0) {
        return res.status(404).json({ status: "Data Empty after filter" });
    }

    const latestCandle = historyData[historyData.length - 1];
    let volSpikeRatio = 0;
    let volatilityRatio = 0;
    const PERIOD = 16;

    if (historyData.length > PERIOD) {
        volatilityRatio = calculateVolatilityRatio(historyData, PERIOD);
        
        // Optimasi: Tidak perlu map ulang volumeArray jika logic MA bisa terima object
        // Tapi jika library stockAnalysis butuh array angka, lakukan map hanya untuk slice terakhir
        // agar tidak meloop seluruh history panjang.
        const relevantHistory = historyData.slice(-(PERIOD + 1)); // Ambil secukupnya saja
        const relevantVolume = relevantHistory.map(d => d.volume);
        
        const maVolume16 = calculateMAVolume(relevantVolume, PERIOD);
        const currentVolume = relevantVolume[relevantVolume.length - 1];
        volSpikeRatio = calculateVolumeRatio(currentVolume, maVolume16);
    }

    // Response JSON ringkas
    res.status(200).json({
      status: "Sukses",
      ticker, // Shorthand property
      volSpikeRatio: Number(volSpikeRatio.toFixed(3)), // Number() lebih bersih dari parseFloat
      volatilityRatio: Number(volatilityRatio.toFixed(3)),
      lastData: latestCandle
    });

  } catch (error) {
    console.error(error); // Log ringkas
    res.status(500).json({ error: 'Server Error' });
  }
};
