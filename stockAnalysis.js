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
function calculateLRS(closes, PERIOD) {
  if (!Array.isArray(closes) || closes.length !== PERIOD) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < PERIOD; i++) {
    const x = i + 1;           // SEQUENCE(20)
    const y = Number(closes[i]);
    if (!isFinite(y)) return 0;

    sumX  += x;
    sumY  += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = (PERIOD * sumX2) - (sumX * sumX);
  if (denom === 0) return 0;

  const slope =
    ((PERIOD * sumXY) - (sumX * sumY)) / denom;

  const avg = sumY / PERIOD;
  if (avg === 0) return 0;

  return Math.abs((slope / avg) * 100);
}



//Menghitung averageLRS
function calculateAverageLRS(historyData, PERIOD = 20, OFFSET = 0) {
  const N = historyData.length;
  const endT = N - OFFSET;

  // butuh data minimal
  if (endT < PERIOD * 2) return 0;

  const lrsValues = [];

  // t = (N-OFFSET-PERIOD) → (N-OFFSET)
  for (let t = endT - PERIOD; t < endT; t++) {
    const start = t - PERIOD + 1;
    if (start < 0) continue;

    const closes = historyData
      .slice(start, t + 1)
      .map(d => d.close);

    if (closes.length === PERIOD) {
      const lrs = calculateLRS(closes, PERIOD);
      if (isFinite(lrs)) lrsValues.push(lrs);
    }
  }

  if (lrsValues.length === 0) return 0;

  return lrsValues.reduce((a, b) => a + b, 0) / lrsValues.length;
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
