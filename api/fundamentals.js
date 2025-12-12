// api/fundamentals.js

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
        const promises = tickers.map(t => fetchFundamentalData(t));
        const results = await Promise.all(promises);

        return res.status(200).json({ results });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};

/**
 * Fungsi Mengambil Data Fundamental dengan Header Anti-Bot
 */
async function fetchFundamentalData(ticker) {
    // TIPS: Gunakan query2.finance.yahoo.com kadang lebih jarang 401 dibanding query1
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,summaryDetail,price`;

    // HEADER LENGKAP UNTUK MENYAMAR SEBAGAI BROWSER
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    };

    try {
        const response = await fetch(url, { headers });
        
        // Handle Error HTTP
        if (!response.ok) {
            // Jika 404/401, coba fallback ke query1 sekali lagi
            if (response.status === 404 || response.status === 401) {
                return retryQuery1(ticker, headers);
            }
            return { ticker, status: "Error", note: `Yahoo Error ${response.status}` };
        }

        const json = await response.json();
        const result = json?.quoteSummary?.result?.[0];

        if (!result) {
            return { ticker, status: "Not Found", note: "No Data returned" };
        }

        return parseResult(ticker, result);

    } catch (error) {
        return { ticker, status: "Error", note: error.message };
    }
}

// Fungsi Fallback jika query2 gagal
async function retryQuery1(ticker, headers) {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=defaultKeyStatistics,summaryDetail,price`;
    try {
        const response = await fetch(url, { headers });
        if (!response.ok) return { ticker, status: "Error", note: `Yahoo Error ${response.status} (Retry)` };
        
        const json = await response.json();
        const result = json?.quoteSummary?.result?.[0];
        
        if (!result) return { ticker, status: "Not Found", note: "No Data" };
        
        return parseResult(ticker, result);
    } catch (e) {
        return { ticker, status: "Error", note: e.message };
    }
}

// Helper Parsing JSON
function parseResult(ticker, result) {
    const stats = result.defaultKeyStatistics || {};
    const summary = result.summaryDetail || {};
    const price = result.price || {};

    return {
        status: "Sukses",
        ticker: ticker,
        name: price.shortName || "-", 
        floatShares: stats.floatShares?.fmt || "-", 
        marketCap: summary.marketCap?.fmt || "-",
        sharesOutstanding: stats.sharesOutstanding?.fmt || "-",
        avgVolume10D: summary.averageVolume10days?.fmt || "-"
    };
}
