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
    if (candle.high > maxPrice) maxPrice = candle.high;
    if (candle.low < minPrice) minPrice = candle.low;
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

function calculateAverageLRS(historicalDataArray, period, offset) {
  const end = historicalDataArray.length - offset;
  if (end < period * 2) return 0;
  let sum = 0, count = 0;
  for (let t = end - 1; t >= end - period; t--) {
    const closesData = historicalDataArray.slice(t - period + 1, t + 1).map(d => d.close);
    if (closesData.length !== period) continue;
    sum += calculateLRS(closesData, period);
    count++;
  }
  return count ? sum / count : 0;
}

function calculateVolumeRatio(currentVolume, maVolume) {
  return (maVolume === 0 || isNaN(maVolume)) ? 0 : currentVolume / maVolume;
}

function calculateMaxClose(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0; 
  const closes = historicalDataArray.slice(-period).map(candle => candle.close);
  return Math.max(...closes);
}

function calculateSTDEV(dataArray, period) {
  const relevantData = dataArray.slice(-period);
  const n = relevantData.length;
  if (n < 2) return 0;
  const avg = relevantData.reduce((a, b) => a + b, 0) / n;
  const sumSquareDiffs = relevantData.reduce((a, b) => a + Math.pow(b - avg, 2), 0);
  return Math.sqrt(sumSquareDiffs / (n - 1));
}

module.exports = {
  calculateAverage, calculateMA, calculateVolumeRatio, calculateVolatilityRatio,
  calculateLRS, calculateAverageLRS, calculateMaxClose, calculateSTDEV
};
