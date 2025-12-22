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
function calculateLRS(dataArray, period) {
  if (dataArray.length < period) return 0;

  // Ambil data array close
  const relevantHistory = dataArray.slice(-period);
  const y = relevantHistory.map(candle => candle.close);
  const n = period;
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i + 1; // Urutan waktu (1, 2, 3...n)
    const currentY = y[i];
    
    sumX += x;
    sumY += currentY;
    sumXY += (x * currentY);
    sumX2 += (x * x);
  }

  // Rumus Slope: (n*sumXY - sumX*sumY) / (n*sumX2 - sumX^2)
  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = (n * sumX2) - (Math.pow(sumX, 2));

  if (denominator === 0) return 0;
  const slopeNominal = numerator / denominator;
  const avgPrice = sumY / n;
  return (slopeNominal / avgPrice) * 100;  // Hasil : % kemiringan
}

//Menghitung averageLRS
function calculateAverageLRS(historyData, period) {
  if (historyData.length < period * 2) return 0;

  const lrsValues = [];

  for (let i = historyData.length - period; i >= period; i--) {
    const window = historyData.slice(i - period, i);
    const lrs = calculateLRS(window, period);

    if (isFinite(lrs)) {
      lrsValues.push(lrs);
    }
  }

  if (lrsValues.length === 0) return 0;

  const sum = lrsValues.reduce((a, b) => a + b, 0);
  return sum / lrsValues.length;
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
 * Menghitung Array OBV
 * @param {Array} subCandles - Data candle dari timeframe lebih kecil
 */
function calculateOBVArray(subCandles) {
  let currentNetOBV = 0;

  return subCandles.map(candle => {
    let delta = 0;

    const open = candle.open ?? candle.close;
    const close = candle.close;
    const high = candle.high ?? Math.max(open, close);
    const low  = candle.low  ?? Math.min(open, close);
    const volume = candle.volume || 0;

    const range = Math.max(1, high - low);
    const bodyStrength = Math.abs(close - open) / range;

    if (close > open) {
      delta = volume * bodyStrength;
    } else if (close < open) {
      delta = -volume * bodyStrength;
    }

    currentNetOBV += delta;

    return {
      timestamp: candle.timestamp,
      deltaOBV: delta,
      netOBV: currentNetOBV
    };
  });
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
};
