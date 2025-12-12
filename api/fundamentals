// api/fundamentals.js

module.exports = async (req, res) => {
    // 1. Validasi Method: Hanya menerima POST (untuk Bulk Processing)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    try {
        // 2. Parsing Body
        // Menangani input baik berupa string JSON maupun object langsung
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { tickers } = body;

        // Validasi input array tickers
        if (!tickers || !Array.isArray(tickers)) {
            return res.status(400).json({ error: "Invalid body. 'tickers' array required." });
        }

        // 3. Proses Paralel (Concurrent Fetching)
        // Mengambil data untuk semua ticker sekaligus tanpa menunggu satu per satu
        const promises = tickers.map(t => fetchFundamentalData(t));
        const results = await Promise.all(promises);

        // 4. Kirim Hasil
        return res.status(200).json({ results });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

/**
 * Fungsi Mengambil Data Fundamental Spesifik
 * Target: Float Shares & Market Cap
 */
async function fetchFundamentalData(ticker) {
    // Kita meminta 3 modul sekaligus:
    // - defaultKeyStatistics: Untuk 'floatShares'
    // - summaryDetail: Untuk 'marketCap'
    // - price: Untuk 'shortName' (Nama Perusahaan)
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,summaryDetail,price`;

    try {
        const response = await fetch(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' } // Wajib ada agar tidak diblokir Yahoo
        });
        
        if (!response.ok) {
            return { ticker, status: "Error", note: `Yahoo Error ${response.status}` };
        }

        const json = await response.json();
        const result = json?.quoteSummary?.result?.[0];

        if (!result) {
            return { ticker, status: "Not Found", note: "No Data returned" };
        }

        // Akses "Laci" Data
        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};
        const price = result.price || {};

        return {
            status: "Sukses",
            ticker: ticker,
            
            // Info Perusahaan
            name: price.shortName || "-", 
            
            // DATA UTAMA 1: Float Shares
            // fmt: Format teks (misal "2.5B"), raw: Angka asli
            floatShares: stats.floatShares?.fmt || "-", 
            
            // DATA UTAMA 2: Market Cap
            marketCap: summary.marketCap?.fmt || "-",
            
            // Data Tambahan (Opsional, berguna untuk filter)
            sharesOutstanding: stats.sharesOutstanding?.fmt || "-",
            avgVolume10D: summary.averageVolume10days?.fmt || "-"
        };

    } catch (error) {
        return { ticker, status: "Error", note: error.message };
    }
}
