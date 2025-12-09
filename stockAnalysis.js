// stockAnalysis.js

function calculateAverage(dataArray) {
  if (dataArray.length === 0) return 0;
  const validData = dataArray.filter(val => typeof val === 'number' && !isNaN(val));
  if (validData.length === 0) return 0;
  return validData.reduce((acc, val) => acc + val, 0) / validData.length;
}

/**
 * Menghitung MA Volume.
 * Input volumeArray adalah data volume stabil (0 hingga N-1).
 */
function calculateMAVolume(volumeArray, period) {
  // Hanya ambil data historis: buang candle terakhir dari array yang dikirim
  const historicalOnly = volumeArray.slice(0, volumeArray.length - 1); // Ini sekarang adalah (N-2) ke belakang
  
  if (historicalOnly.length < period) return 0;
  
  const relevantVolume = historicalOnly.slice(historicalOnly.length - period);
  return calculateAverage(relevantVolume);
}

/**
 * Menghitung Rasio Volatilitas (Max/Min).
 * Input historicalDataArray adalah data harga stabil (0 hingga N-1).
 */
function calculateVolatilityRatio(historicalDataArray, period) {
  // Hanya ambil data historis: buang candle terakhir dari array yang dikirim
  const historicalOnly = historicalDataArray.slice(0, historicalDataArray.length - 1);
  
  if (historicalOnly.length < period) return 0;
  
  const relevantHistory = historicalOnly.slice(historicalOnly.length - period);
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  
  for (const day of relevantHistory) {
    if (day.high > maxPrice) maxPrice = day.high;
    if (day.low < minPrice) minPrice = day.low;
  }
  return (minPrice === 0 || minPrice === Infinity) ? 1 : maxPrice / minPrice;
}

function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 0; 
  return currentVolume / maVolume;
}

module.exports = {
  calculateMAVolume,
  calculateVolumeRatio,
  calculateVolatilityRatio,
};
