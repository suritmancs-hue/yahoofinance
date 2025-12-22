/**
 * stockAnalysis.js - Logika perhitungan modular
 */

function calculateAverage(dataArray) {
  if (dataArray.length === 0) return 0;
  const validData = dataArray.filter(val => typeof val === 'number' && !isNaN(val));
  if (validData.length === 0) return 0;
  return validData.reduce((acc, val) => acc + val, 0) / validData.length;
}

/**
 * Menghitung MA Volume.
 */
function calculateMA(dataArray, period) {
  if (dataArray.length < period) return 0;
  const relevantData = dataArray.slice(dataArray.length - period);
  return calculateAverage(relevantData);
}

/**
 *Menghitung Rasio Volatilitas
 */
function calculateVolatilityRatio(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0; 
  const relevantHistory = historicalDataArray.slice(historicalDataArray.length - period);
  
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  
  for (const candle of relevantHistory) {
    // Cari titik tertinggi dari Body (bisa Open atau Close tergantung candle hijau/merah)
    const topBody = Math.max(candle.high);    //Math.max(candle.open, candle.close);
    
    // Cari titik terendah dari Body
    const bottomBody = Math.min(candle.low);   //Math.min(candle.open, candle.close);

    // Update Max dan Min periode
    if (topBody > maxPrice) maxPrice = topBody;
    if (bottomBody < minPrice) minPrice = bottomBody;
  }
  
  return (minPrice === 0 || minPrice === Infinity) ? 1 : maxPrice / minPrice;
}

/**
 * Menghitung Linear Regression Slope (LRS)
 * @param {Array} dataArray - Array berisi harga penutupan (close)
 * @param {number} period - Periode yang dihitung (misal: 25)
 */
function calculateLRS(closesArray, period) {
  if (!Array.isArray(closesArray) || closesArray.length !== period) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < period; i++) {
    const x = i + 1;           // SEQUENCE(20)
    const y = Number(closesArray[i]);
    if (!isFinite(y)) return 0;

    sumX  += x;
    sumY  += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = (period * sumX2) - (sumX * sumX);
  if (denom === 0) return 0;

  const slope =
    ((period * sumXY) - (sumX * sumY)) / denom;

  const avg = sumY / period;
  if (avg === 0) return 0;

  return Math.abs((slope / avg) * 100);
}



//Menghitung averageLRS
function calculateAverageLRS(historicalDataArray, period, offset) {
  const end = historicalDataArray.length - offset;

  if (end < period * 2) return 0;

  let sum = 0;
  let count = 0;

  // ulangi sebanyak PERIOD
  for (let t = end - 1; t >= end - period; t--) {
    const closesData = historicalDataArray
      .slice(t - period + 1, t + 1)
      .map(d => d.close);

    if (closesData.length !== period) continue;

    const lrs = calculateLRS(closesData, period);
    sum += lrs;
    count++;
  }
  return count ? sum / count : 0;
}


/**
 * Menghitung Rasio Spike.
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 0; 
  return currentVolume / maVolume;
}

/**
 * Menghitung Max Price sebelumnya.
 */
function calculateMaxClose(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0; 
  const relevantHistory = historicalDataArray.slice(historicalDataArray.length - period);
  const closes = relevantHistory.map(candle => candle.close);
  return Math.max(...closes);
}


/**
 * Menghitung Array OBV dengan sinkronisasi Volume Timeframe Besar
 * @param {Array} subCandles - Data candle timeframe kecil (misal 1h/15m)
 * @param {number} mainVolume - Total volume dari timeframe besar (1d)
 */
function calculateOBVArray(subCandlesArray, mainVolumeArray) {
  // 1. Hitung total volume dari semua subCandles (timeframe kecil)
  const totalSubVolume = subCandlesArray.reduce((sum, c) => sum + (c.volume || 0), 0);

  // 2. Tentukan faktor skala (Scale Factor)
  // Jika totalSubVolume adalah 1M dan mainVolume adalah 2M, maka faktornya adalah 2
  const scaleFactor = (totalSubVolume > 0 && mainVolumeArray > 0) ? (mainVolumeArray / totalSubVolume) : 1;

  let currentNetOBV = 0;

  return subCandlesArray.map(candle => {
    let delta = 0;

    const open = candle.open ?? candle.close;
    const close = candle.close;
    const high = candle.high ?? Math.max(open, close);
    const low  = candle.low  ?? Math.min(open, close);
    
    // 3. Kalikan volume timeframe kecil dengan scaleFactor
    const syncedVolume = (candle.volume || 0) * scaleFactor;

    const range = Math.max(1, high - low);
    const bodyStrength = Math.abs(close - open) / range;

    // 4. Gunakan syncedVolume untuk menghitung delta
    if (close > open) {
      delta = syncedVolume * bodyStrength;
    } else if (close < open) {
      delta = -syncedVolume * bodyStrength;
    }

    currentNetOBV += delta;

    return {
      timestamp: candle.timestamp,
      deltaOBV: delta,
      netOBV: currentNetOBV
    };
  });
}

/**
 * Menghitung Standard Deviation (STDEV)
 * Sama dengan fungsi STDEV di Spreadsheet
 */
function calculateSTDEV(dataArray, period) {
  const relevantData = dataArray.slice(-period)
  const n = relevantData.length;
  if (n < 2) return 0; // STDEV butuh minimal 2 data point

  // 1. Cari Rata-rata (Mean)
  const avg = relevantData.reduce((a, b) => a + b, 0) / n;

  // 2. Hitung jumlah kuadrat selisih (Square Deviations)
  const squareDiffs = relevantData.map(value => {
    const diff = value - avg;
    return diff * diff;
  });

  const sumSquareDiffs = squareDiffs.reduce((a, b) => a + b, 0);

  // 3. Bagi dengan (n - 1) untuk STDEV Sampel (sama dengan Excel/Sheets)
  // Gunakan n jika ingin STDEV Populasi
  const variance = sumSquareDiffs / (n - 1);

  // 4. Akar kuadrat dari varians
  return Math.sqrt(variance);
}

module.exports = {
  calculateAverage,
  calculateMA,
  calculateVolumeRatio,
  calculateVolatilityRatio,
  calculateLRS,
  calculateAverageLRS,
  calculateMaxClose,
  calculateOBVArray,
  calculateSTDEV,
};
