/**
 * stockAnalysis.js
 */

function calculateAverage(dataArray) {
  if (dataArray.length === 0) return 0;
  const validData = dataArray.filter(val => typeof val === 'number' && !isNaN(val));
  return validData.length === 0 ? 0 : validData.reduce((acc, val) => acc + val, 0) / validData.length;
}

function calculateMA(dataArray, period) {
  if (dataArray.length < period) return 0;
  return calculateAverage(dataArray.slice(-period));
}

function calculateVolatilityRatio(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0; 
  const relevantHistory = historicalDataArray.slice(-period);
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  for (const candle of relevantHistory) {
    if (candle.close > maxPrice) maxPrice = candle.close;
    if (candle.close < minPrice) minPrice = candle.close;
  }
  return (minPrice === 0 || minPrice === Infinity) ? 1 : maxPrice / minPrice;
}

function calculateLRS(closesArray, period) {
  if (!Array.isArray(closesArray) || closesArray.length !== period) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < period; i++) {
    const x = i + 1;
    const y = Number(closesArray[i]);
    if (!isFinite(y)) return 0;
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
  }
  const denom = (period * sumX2) - (sumX * sumX);
  if (denom === 0) return 0;
  const slope = ((period * sumXY) - (sumX * sumY)) / denom;
  const avg = sumY / period;
  return avg === 0 ? 0 : (slope / avg) * 100;
}

function calculateMaxClose(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0; 
  const closes = historicalDataArray.slice(-period).map(candle => candle.close);
  return Math.max(...closes);
}

function calculateMinClose(historicalDataArray, period) {
  if (historicalDataArray.length === 0) return 0;
  const closes = historicalDataArray.slice(-period).map(candle => candle.close);
  return Math.min(...closes);
}

function calculateOpenClose(historicalDataArray, period) {
  const results = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const targetArraySize = period + 1;
    const dataWithoutLast = historicalDataArray.slice(0, -1);
    
    if (dataWithoutLast.length < targetArraySize) {
      results.push(0);
      continue;
    }
    
    const subset = dataWithoutLast.slice(-targetArraySize);
    let oc = 0;
    // Logika perhitungan OC
    for (let i = 1; i < subset.length; i++) {
        const currentOpen = subset[i].open;
        const currentClose = subset[i].close;
        const prevOpen = subset[i-1].open;
        const prevClose = subset[i-1].close;
    
        if ((currentOpen === currentClose) || (prevClose === currentClose) || (prevOpen === currentClose) || (prevOpen === currentOpen)) {
          oc += 1;
        }
    }
    results.push(oc);
  }
  // Mengembalikan nilai minimal dari 5 kali perulangan tersebut
  return Math.min(...results);
}

function calculateSTDEV(dataArray, period) {
  const relevantData = dataArray.slice(-period);
  const n = relevantData.length;
  if (n < 2) return 0;
  const avg = relevantData.reduce((a, b) => a + b, 0) / n;
  const sumSquareDiffs = relevantData.reduce((a, b) => a + Math.pow(b - avg, 2), 0);
  return Math.sqrt(sumSquareDiffs / n);
}

function calculateMFI(candles, period = 14) {
    if (candles.length <= period) return 50; // Return neutral jika data kurang

    let posMF = 0;
    let negMF = 0;

    // Ambil subset data sesuai periode dari belakang
    const startIdx = candles.length - period;
    
    for (let i = startIdx; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i - 1];

        const tpCurrent = (current.high + current.low + current.close) / 3;
        const tpPrev = (prev.high + prev.low + prev.close) / 3;
        const rmf = tpCurrent * current.volume;

        if (tpCurrent > tpPrev) {
            posMF += rmf;
        } else if (tpCurrent < tpPrev) {
            negMF += rmf;
        }
    }

    if (negMF === 0) return 100;
    const mfr = posMF / negMF;
    return 100 - (100 / (1 + mfr));
}

function calculateRSI(candles, period) {
    if (candles.length <= period) return 50; // Return neutral jika data tidak cukup

    let totalGain = 0;
    let totalLoss = 0;

    // Ambil subset data sesuai periode dari belakang
    const startIdx = candles.length - period;

    for (let i = startIdx; i < candles.length; i++) {
        const current = candles[i];
        const prev = candles[i - 1];

        const change = current.close - prev.close;

        if (change > 0) {
            totalGain += change;
        } else if (change < 0) {
            totalLoss += Math.abs(change);
        }
    }

    // Jika tidak ada penurunan sama sekali dalam periode tersebut
    if (totalLoss === 0) return 100;
    
    // Menghitung Relative Strength (RS)
    const rs = totalGain / totalLoss;

    // Menghitung RSI
    return 100 - (100 / (1 + rs));
}

function calculateADX(candles, period = 14) {
  // ADX membutuhkan data minimal (2 * period) untuk smoothing yang akurat, 
  // tapi secara teknis bisa berjalan dengan (period + 1) data.
  if (!candles || candles.length <= period) return 0;

  let trs = [];
  let plusDMs = [];
  let minusDMs = [];

  // 1. Hitung TR, +DM, dan -DM untuk setiap candle
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];

    // True Range (TR)
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);

    // Directional Movement (+DM dan -DM)
    const upMove = current.high - prev.high;
    const downMove = prev.low - current.low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }

    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  // 2. Ambil subset data sesuai periode dari belakang
  const relevantTR = trs.slice(-period);
  const relevantPlusDM = plusDMs.slice(-period);
  const relevantMinusDM = minusDMs.slice(-period);

  const sumTR = relevantTR.reduce((a, b) => a + b, 0);
  const sumPlusDM = relevantPlusDM.reduce((a, b) => a + b, 0);
  const sumMinusDM = relevantMinusDM.reduce((a, b) => a + b, 0);

  if (sumTR === 0) return 0;

  // 3. Hitung +DI dan -DI
  const plusDI = (sumPlusDM / sumTR) * 100;
  const minusDI = (sumMinusDM / sumTR) * 100;

  // 4. Hitung DX (Directional Index)
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

  return dx;
}

/**
 * Mendeteksi Divergensi menggunakan Swing-Based Pivot (High/Low)
 * @param {Array} candles Array objek OHLC
 * @param {Array} indicators Array nilai indikator (misal RSI atau MFI)
 * @param {number} lookback Periode pengecekan
 */
function calculateDivergence(candles, indicators, lookback = 20) {
  try {
    const closes = candles.map(c => c.close);
    const len = Math.min(closes.length, indicators.length);

    if (len < 5) return "Menunggu Data";

    // PIVOT DETECTOR
    const findPivots = (arr, type) => {
      let pivots = [];
      for (let i = 1; i < arr.length - 1; i++) {
        if (
          (type === 'low' && arr[i] < arr[i - 1] && arr[i] < arr[i + 1]) ||
          (type === 'high' && arr[i] > arr[i - 1] && arr[i] > arr[i + 1])
        ) {
          pivots.push({ index: i, value: arr[i] });
        }
      }
      return pivots;
    };

    const sliceStart = Math.max(0, len - lookback);
    const pSlice = closes.slice(sliceStart);
    const iSlice = indicators.slice(sliceStart);

    const pLow = findPivots(pSlice, 'low');
    const pHigh = findPivots(pSlice, 'high');
    const iLow = findPivots(iSlice, 'low');
    const iHigh = findPivots(iSlice, 'high');

    const lastP = pSlice[pSlice.length - 1];
    const lastI = iSlice[iSlice.length - 1];

    // LOGIKA KETIKA PIVOT TIDAK LENGKAP (< 2)
    if (pLow.length < 2 || pHigh.length < 2 || iLow.length < 2 || iHigh.length < 2) {
      // Sinyal Awal Bullish
      if (pLow.length >= 1 && iLow.length >= 1) {
        const lastPLow = pLow[pLow.length - 1].value;
        const lastILow = iLow[iLow.length - 1].value;
        if (lastP < lastPLow && lastI > lastILow && lastI < 80) return "POTENSI BULLISH";
      }
      // Sinyal Awal Bearish
      if (pHigh.length >= 1 && iHigh.length >= 1) {
        const lastPHigh = pHigh[pHigh.length - 1].value;
        const lastIHigh = iHigh[iHigh.length - 1].value;
        if (lastP > lastPHigh && lastI < lastIHigh && lastI > 20) return "POTENSI BEARISH";
      }
      return "-";
    }

    // LOGIKA DIVERGENSI STANDAR (2 PIVOT)
    const pLow1 = pLow[pLow.length - 2];
    const pLow2 = pLow[pLow.length - 1];
    const pHigh1 = pHigh[pHigh.length - 2];
    const pHigh2 = pHigh[pHigh.length - 1];

    const iLow1 = iLow[iLow.length - 2];
    const iLow2 = iLow[iLow.length - 1];
    const iHigh1 = iHigh[iHigh.length - 2];
    const iHigh2 = iHigh[iHigh.length - 1];

    // BULLISH DIVERGENCE
    if (pLow2.value < pLow1.value && iLow2.value > iLow1.value) {
      return "BULLISH DIVERGENCE";
    }

    // BEARISH DIVERGENCE
    if (pHigh2.value > pHigh1.value && iHigh2.value < iHigh1.value) {
      return "BEARISH DIVERGENCE";
    }

    // CONVERGENCE (CONTINUATION)
    if (pHigh2.value > pHigh1.value && iHigh2.value > iHigh1.value) return "BULLISH CONTINU";
    if (pLow2.value < pLow1.value && iLow2.value < iLow1.value) return "BEARISH CONTINU";

    return "-";
  } catch (err) {
    return "Error: " + err.message;
  }
}

module.exports = {
  calculateAverage,
  calculateMA, 
  calculateVolatilityRatio,
  calculateLRS, 
  calculateMaxClose, 
  calculateMinClose, 
  calculateOpenClose, 
  calculateSTDEV, 
  calculateMFI, 
  calculateRSI,
  calculateADX,
  calculateDivergence
};
