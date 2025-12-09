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
function calculateMAVolume(volumeArray, period) {
  const historicalOnly = volumeArray.slice(0, volumeArray.length); 
  if (historicalOnly.length < period) return 0;
  const relevantVolume = historicalOnly.slice(historicalOnly.length - period);
  return calculateAverage(relevantVolume);
}

/**
 * Menghitung Rasio Volatilitas (Max/Min)..
 */
function calculateVolatilityRatio(historicalDataArray, period) {
  const historicalOnly = historicalDataArray.slice(0, historicalDataArray.length);
  if (historicalOnly.length < period) return 0; 
  const relevantHistory = historicalOnly.slice(historicalOnly.length - period);
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  
  for (const indeks of relevantHistory) {
    if (indeks.high > maxPrice) maxPrice = indeks.high;
    if (indeks.low < minPrice) minPrice = indeks.low;
  }
  return (minPrice === 0 || minPrice === Infinity) ? 1 : maxPrice / minPrice;
}

/**
 * Menghitung Rasio Spike.
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 0; 
  return currentVolume / maVolume;
}

module.exports = {
  calculateMAVolume,
  calculateVolumeRatio,
  calculateVolatilityRatio,
};
