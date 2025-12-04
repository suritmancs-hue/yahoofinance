/**
 * stockAnalysis.js - Berisi semua fungsi perhitungan analitik.
 */

// --- Fungsi Pembantu (Helper) ---

/**
 * Menghitung Rata-rata dari array angka.
 */
function calculateAverage(dataArray) {
  if (dataArray.length === 0) return 0;
  const validData = dataArray.filter(val => typeof val === 'number' && !isNaN(val));
  if (validData.length === 0) return 0;
  
  const sum = validData.reduce((acc, val) => acc + val, 0);
  return sum / validData.length;
}


// --- Indikator Utama ---

/**
 * Menghitung Rata-rata Volume (Moving Average Volume - MA Volume).
 */
function calculateMAVolume(volumeArray, period) {
  if (volumeArray.length < period) return 0;
  
  const startIndex = volumeArray.length - period;
  if (startIndex < 0) return 0;
  
  const relevantVolume = volumeArray.slice(startIndex);
  return calculateAverage(relevantVolume);
}

/**
 * Menghitung Rasio Volatilitas (Max Price 16 / Min Price 16).
 */
function calculateVolatilityRatio(historyData, period) {
  if (historyData.length < period) return 0;
  
  const startIndex = historyData.length - period;
  if (startIndex < 0) return 0;
  
  const relevantHistory = historyData.slice(startIndex);
  
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  
  for (const day of relevantHistory) {
    if (day.high > maxPrice) {
      maxPrice = day.high;
    }
    if (day.low < minPrice) {
      minPrice = day.low;
    }
  }

  if (minPrice === 0 || minPrice === Infinity) return 999;
  
  return maxPrice / minPrice;
}


// --- Rasio yang Diperlukan ---

/**
 * Menghitung Rasio Volume Spike (Vol sekarang / MA Volume).
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 999; 
  return currentVolume / maVolume;
}

// --- Ekspor Modul (PENTING untuk Node.js/Vercel) ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateMAVolume,
    calculateVolumeRatio,
    calculateVolatilityRatio,
  };
}
