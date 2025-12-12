// api/fundamentals.js
const yahooFinance = require('yahoo-finance2').default; // Import library 

module.exports = async (req, res) => {
    // 1. Validasi Method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    try {
        // 2. Parsing Body
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { tickers } = body;

        if (!tickers || !Array.isArray(tickers)) {
            return res.status(400).json({ error: "Invalid body. 'tickers' array required." });
        }

        // 3. Proses Paralel
        // Library yahoo-finance2 sudah handle queue, tapi kita tetap map untuk format custom
        const promises = tickers.map(t => fetchFundamentalData(t));
        const results = await Promise.all(promises);

        return res.status(200).json({ results });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

/**
 * Fungsi Fetch menggunakan yahoo-finance2
 */
async function fetchFundamentalData(ticker) {
    try {
        const result = await yahooFinance.quoteSummary(ticker, {
            modules: ['defaultKeyStatistics', 'summaryDetail', 'price']
        });

        if (!result) {
            return { ticker, status: "Not Found", note: "No Data" };
        }

        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};
        const price = result.price || {};

        // Ambil Data Mentah (Raw) untuk perhitungan
        const floatRaw = stats.floatShares || 0;
        const outstandingRaw = stats.sharesOutstanding || 0;

        // Hitung Persentase Float
        let floatPercent = 0;
        if (outstandingRaw > 0) {
            floatPercent = (floatRaw / outstandingRaw) * 100;
        }

        return {
            status: "Sukses",
            ticker: ticker,
            name: price.shortName || "-", 
            
            // Data Teks (untuk tampilan cantik)
            floatShares: formatNumber(floatRaw), 
            marketCap: formatNumber(summary.marketCap),
            
            // Data Mentah & Hasil Hitungan (untuk Logika)
            floatRaw: floatRaw,
            outstandingRaw: outstandingRaw,
            floatPercent: floatPercent.toFixed(2) + "%" // Contoh: "35.50%"
        };

    } catch (error) {
        return { ticker, status: "Error", note: error.message };
    }
}

// Helper format angka (Tetap sama)
function formatNumber(num) {
    if (!num || isNaN(num)) return "-";
    if (num >= 1.0e+12) return (num / 1.0e+12).toFixed(2) + "T";
    if (num >= 1.0e+9) return (num / 1.0e+9).toFixed(2) + "B";
    if (num >= 1.0e+6) return (num / 1.0e+6).toFixed(2) + "M";
    return num.toString();
}
