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
 * Hanya menggunakan data historis (mengabaikan volume candle terakhir).
 */
function calculateMAVolume(volumeArray, period) {
  // 1. Keluarkan volume candle terakhir
  const historicalVolume = volumeArray.slice(0, volumeArray.length - 1);
  
  if (historicalVolume.length < period) return 0;
  
  // 2. Ambil volume dari periode N hari terakhir dari data historis
  const startIndex = historicalVolume.length - period;
  if (startIndex < 0) return 0;
  
  const relevantVolume = historicalVolume.slice(startIndex);
  return calculateAverage(relevantVolume);
}

/**
 * Menghitung Rasio Volatilitas (Max Price 16 / Min Price 16).
 * Hanya menggunakan data historis (mengabaikan candle terakhir).
 */
function calculateVolatilityRatio(historyData, period) {
  // 1. Keluarkan candle terakhir dari data
  const historicalHistory = historyData.slice(0, historyData.length - 1);

  if (historicalHistory.length < period) return 0;
  
  // 2. Ambil data harga dari periode N hari terakhir dari data historis
  const startIndex = historicalHistory.length - period;
  if (startIndex < 0) return 0;
  
  const relevantHistory = historicalHistory.slice(startIndex);
  
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
 * (Fungsi ini tetap sama, karena yang diubah adalah calculateMAVolume yang dipanggilnya)
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 999; 
  return currentVolume / maVolume;
}

// --- Ekspor Modul ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateMAVolume,
    calculateVolumeRatio,
    calculateVolatilityRatio,
  };
}
