// api/fundamentals.js
const YahooFinance = require('yahoo-finance2').default;

// Inisialisasi dengan opsi untuk menyembunyikan notifikasi survey
const yahooFinance = new YahooFinance({ 
    suppressNotices: ['yahooSurvey'] 
}); 

module.exports = async (req, res) => {
    // 1. Validasi Method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    try {
        // 2. Parsing Body yang aman
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { tickers } = body;

        if (!tickers || !Array.isArray(tickers)) {
            return res.status(400).json({ error: "Invalid body. 'tickers' array required." });
        }

        // Batasi jumlah ticker per request agar tidak timeout di Vercel (Max 10 detik)
        const limitedTickers = tickers.slice(0, 30);
        const promises = limitedTickers.map(t => fetchFundamentalData(t));
        const results = await Promise.all(promises);

        return res.status(200).json({ results });

    } catch (e) {
        return res.status(500).json({ error: "Server Error: " + e.message });
    }
};

async function fetchFundamentalData(ticker) {
    try {
        const symbol = ticker.toUpperCase().trim();
        
        const result = await yahooFinance.quoteSummary(symbol, {
            modules: ['defaultKeyStatistics', 'summaryDetail', 'price']
        });
        console.log(result);

        if (!result) {
            return { ticker: symbol, status: "Not Found", note: "No Data" };
        }

        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};
        const price = result.price || {};

        const marketCapRaw = summary.marketCap || 0;
        const outstandingRaw = stats.impliedSharesOutstanding || stats.sharesOutstanding || 0;
        const floatRaw = stats.floatShares || 0;
        const insiderPercentRaw = stats.heldPercentInsiders ? stats.heldPercentInsiders.raw : 0;
        const instPercentTotalRaw = stats.heldPercentInstitutions ? stats.heldPercentInstitutions.raw : 0;

        // Perhitungan Persentase Float: 100% - % Held by Insiders
        // Kita gunakan (1 - insiderPercentRaw) * 100
        let floatPercent = (1 - insiderPercentRaw) * 100;
        // Jika data insider kosong (0), dan Anda ingin tetap menggunakan data floatRaw sebagai cadangan:
        if (insiderPercentRaw === 0 && outstandingRaw > 0 && floatRaw > 0) {
            floatPercent = (floatRaw / outstandingRaw) * 100;
        }

        // Hitung % Institutional terhadap FREE FLOAT
        // Rumus: (Inst % Total * Outstanding) / Float_Lembar
        let instPercentOfFloat = 0;
        if (floatRaw > 0) {
            const instShares = instPercentTotalRaw * outstandingRaw;
            instPercentOfFloat = (instShares / floatRaw) * 100;
        }

        // Penanganan Anomali Data
        let finalStatus = "Sukses";
        let note = "";
        if (floatPercent > 100) {
            finalStatus = "Anomali";
            note = "Float > 100%. Data Yahoo kemungkinan belum menyesuaikan aksi korporasi.";
        } else if (floatRaw === 0) {
            note = "Data Float tidak tersedia.";
        }

        return {
            status: finalStatus,
            note: note,
            ticker: symbol,
            name: price.shortName || price.longName || "-", 
            marketCap: marketCapRaw, 
            outstanding: outstandingRaw, 
            instPercentOfFloat: instPercentOfFloat, 
            insiderPercent: insiderPercentRaw,
            floatPercent: parseFloat(floatPercent.toFixed(2))
        };

    } catch (error) {
        return { ticker, status: "Error", note: error.message };
    }
}
