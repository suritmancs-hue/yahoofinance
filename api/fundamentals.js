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
        // Kita minta modul spesifik. Library ini otomatis handle crumb/cookie.
        // modules: ['defaultKeyStatistics', 'summaryDetail', 'price']
        const result = await yahooFinance.quoteSummary(ticker, {
            modules: ['defaultKeyStatistics', 'summaryDetail', 'price']
        });

        if (!result) {
            return { ticker, status: "Not Found", note: "No Data" };
        }

        // Ambil data dari hasil library (strukturnya sedikit lebih rapi dari JSON mentah)
        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};
        const price = result.price || {};

        return {
            status: "Sukses",
            ticker: ticker,
            
            // Nama
            name: price.shortName || "-", 
            
            // Float Shares (Library biasanya sudah memberi format angka/raw)
            // Kita format manual biar rapi seperti "1.5B" jika perlu, 
            // atau kirim raw value biar Excel yang format.
            // Di sini kita kirim format text agar aman.
            floatShares: formatNumber(stats.floatShares), 
            
            // Market Cap
            marketCap: formatNumber(summary.marketCap),
            
            // Tambahan
            sharesOutstanding: formatNumber(stats.sharesOutstanding),
            avgVolume10D: formatNumber(summary.averageVolume10days)
        };

    } catch (error) {
        // Library akan melempar error jika ticker salah atau Yahoo down
        return { ticker, status: "Error", note: error.message };
    }
}

// Helper sederhana untuk format angka (Mirip gaya Yahoo: 1.5B, 500M)
function formatNumber(num) {
    if (!num || isNaN(num)) return "-";
    if (num >= 1.0e+12) return (num / 1.0e+12).toFixed(2) + "T";
    if (num >= 1.0e+9) return (num / 1.0e+9).toFixed(2) + "B";
    if (num >= 1.0e+6) return (num / 1.0e+6).toFixed(2) + "M";
    return num.toString();
}
