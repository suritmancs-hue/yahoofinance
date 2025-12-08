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
 * Input volumeArray diasumsikan sudah dipotong candle terakhirnya di analyze.js (0 hingga N-1).
 */
function calculateMAVolume(volumeArray, period) {
  // MA dihitung dari (N-2) ke belakang sebanyak periode
  const historicalVolume = volumeArray.slice(0, volumeArray.length - 1);
  
  if (historicalVolume.length < period) return 0;
  
  const relevantVolume = historicalVolume.slice(historicalVolume.length - period);
  return calculateAverage(relevantVolume);
}

/**
 * Menghitung Rasio Volatilitas (Max/Min).
 * Input historicalDataArray sudah dipotong candle terakhirnya di analyze.js.
 */
function calculateVolatilityRatio(historicalDataArray, period) {
  if (historicalDataArray.length < period) return 0;
  
  const relevantHistory = historicalDataArray.slice(historicalDataArray.length - period);
  
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  
  for (const day of relevantHistory) {
    if (day.high > maxPrice) maxPrice = day.high;
    if (day.low < minPrice) minPrice = day.low;
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
