/**
 * stockAnalysis.js - Berisi semua fungsi perhitungan analitik (ATR, MA Volume, Rasio).
 * File ini akan diimpor dan digunakan oleh api/analyze.js di Vercel.
 */

// --- Fungsi Pembantu (Helper) ---

/**
 * Menghitung Rata-rata dari array angka.
 * @param {number[]} dataArray Array angka (volume, true range, dll.).
 * @returns {number} Rata-rata.
 */
function calculateAverage(dataArray) {
  if (dataArray.length === 0) return 0;
  // Memastikan semua nilai yang dijumlahkan adalah angka (untuk menghindari error NaN)
  const validData = dataArray.filter(val => typeof val === 'number' && !isNaN(val));
  if (validData.length === 0) return 0;
  
  const sum = validData.reduce((acc, val) => acc + val, 0);
  return sum / validData.length;
}

/**
 * Menghitung True Range (TR) untuk satu hari.
 * True Range adalah nilai terbesar dari: 
 * 1. High - Low
 * 2. |High - Close_prev|
 * 3. |Low - Close_prev|
 * * @param {number} H Harga Tertinggi Hari Ini.
 * @param {number} L Harga Terendah Hari Ini.
 * @param {number} C_prev Harga Penutupan Hari Sebelumnya.
 * @returns {number} True Range.
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
 * Menggunakan Simple Moving Average (SMA) dari True Range untuk penyederhanaan.
 * * @param {object[]} historyData Array objek riwayat OHLCV (harus memiliki 'high', 'low', 'close').
 * @param {number} period Periode untuk perhitungan ATR (misalnya, 14 atau 100).
 * @returns {number} Nilai ATR untuk periode tersebut (SMA dari True Range).
 */
function calculateATR(historyData, period) {
  // Perlu n+1 hari (untuk C_prev pertama)
  if (historyData.length < period + 1) return 0; 
  
  const trueRanges = [];
  
  // Mulai dari hari kedua (index 1) karena butuh C_prev (historyData[i-1].close)
  for (let i = 1; i < historyData.length; i++) {
    const H = historyData[i].high;
    const L = historyData[i].low;
    const C_prev = historyData[i - 1].close;
    trueRanges.push(calculateTrueRange(H, L, C_prev));
  }
  
  // Ambil True Range yang relevan untuk periode terakhir
  // True Range array memiliki panjang historyData.length - 1
  const startIndex = trueRanges.length - period;
  if (startIndex < 0) return 0;
  
  const relevantTR = trueRanges.slice(startIndex);
  return calculateAverage(relevantTR);
}


/**
 * Menghitung Rata-rata Volume (Moving Average Volume - MA Volume).
 * @param {number[]} volumeArray Array nilai volume.
 * @param {number} period Periode untuk perhitungan MA Volume (misalnya, 20).
 * @returns {number} Nilai Rata-rata Volume.
 */
function calculateMAVolume(volumeArray, period) {
  if (volumeArray.length < period) return 0;
  
  // Ambil volume dari periode terakhir
  const startIndex = volumeArray.length - period;
  if (startIndex < 0) return 0;
  
  const relevantVolume = volumeArray.slice(startIndex);
  return calculateAverage(relevantVolume);
}

// --- Rasio yang Diperlukan ---

/**
 * Menghitung Rasio ATR (ATR Jangka Pendek / ATR Jangka Panjang).
 * Digunakan untuk mengukur kondisi sideways (volatilitas rendah).
 * @param {number} atrShort ATR Jangka Pendek (misalnya, ATR 14).
 * @param {number} atrLong ATR Jangka Panjang (misalnya, ATR 100).
 * @returns {number} Rasio ATR.
 */
function calculateATRRatio(atrShort, atrLong) {
  if (atrLong === 0 || isNaN(atrLong)) return 999; 
  return atrShort / atrLong;
}

/**
 * Menghitung Rasio Volume Spike (Volume Hari Ini / MA Volume).
 * @param {number} currentVolume Volume Hari Terakhir.
 * @param {number} maVolume Rata-rata Volume (misalnya, MA Volume 20).
 * @returns {number} Rasio Volume Spike.
 */
function calculateVolumeRatio(currentVolume, maVolume) {
  if (maVolume === 0 || isNaN(maVolume)) return 999; 
  return currentVolume / maVolume;
}

// --- Ekspor Modul (PENTING untuk Node.js/Vercel) ---
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateATR,
    calculateMAVolume,
    calculateATRRatio,
    calculateVolumeRatio,
    // Ekspor helper jika diperlukan, meskipun umumnya hanya ekspor fungsi utama
  };
}
