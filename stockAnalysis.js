/**
 * stockAnalysis.js - Berisi semua fungsi perhitungan analitik (ATR, MA Volume, Rasio).
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

/**
 * Menghitung True Range (TR) untuk satu hari.
 */
function calculateTrueRange(H, L, C_prev) {
  const tr1 = H - L;
  const tr2 = Math.abs(H - C_prev);
  const tr3 = Math.abs(L - C_prev);
  return Math.max(tr1, tr2, tr3);
}

// --- Indikator Utama ---

/**
 * Menghitung Rata-rata Pergerakan Sejati (Average True Range - ATR).
 */
function calculateATR(historyData, period) {
  if (historyData.length < period + 1) return 0; 
  
  const trueRanges = [];
  
  for (let i = 1; i < historyData.length; i++) {
    const H = historyData[i].high;
    const L = historyData[i].low;
    const C_prev = historyData[i - 1].close;
    trueRanges.push(calculateTrueRange(H, L, C_prev));
  }
  
  const startIndex = trueRanges.length - period;
  if (startIndex < 0) return 0;
  
  const relevantTR = trueRanges.slice(startIndex);
  return calculateAverage(relevantTR);
}


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

// --- Rasio yang Diperlukan ---

/**
 * Menghitung Rasio ATR (ATR Jangka Pendek / ATR Jangka Panjang) untuk metrik Sideways.
 */
function calculateATRRatio(atrShort, atrLong) {
  if (atrLong === 0 || isNaN(atrLong)) return 999; 
  return atrShort / atrLong;
}

/**
 * Menghitung Rasio Volume Spike (Volume Hari Ini / MA Volume) untuk metrik Akumulasi.
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 999; 
  return currentVolume / maVolume;
}

/**
 * Menghitung Rasio Close vs. High Range (Tekanan Beli).
 * Formula: (Close - Low) / (High - Low)
 */
function calculateCloseRangeRatio(H, L, C) {
  const range = H - L;
  if (range === 0) return 0.5; // Jika tidak ada pergerakan (range 0), anggap netral
  return (C - L) / range;
}

// --- Ekspor Modul (PENTING untuk Node.js/Vercel) ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateATR,
    calculateMAVolume,
    calculateATRRatio,
    calculateVolumeRatio,
    calculateCloseRangeRatio, // <-- FUNGSI BARU DIEKSPOR
  };
}
