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
            modules: ['defaultKeyStatistics', 'summaryDetail']
        });
        console.log(result);

        if (!result) {
            return { ticker: symbol, status: "Not Found", note: "No Data" };
        }

        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};

        const marketCapRaw = summary.marketCap || 0;
        const outstandingRaw = stats.impliedSharesOutstanding || stats.sharesOutstanding || 0;
        const floatRaw = stats.floatShares || 0;
        const insiderPercentRaw =
              typeof stats.heldPercentInsiders === 'number'
                ? stats.heldPercentInsiders
                : 0;
        const instPercentTotalRaw =
              typeof stats.heldPercentInstitutions === 'number'
                ? stats.heldPercentInstitutions
                : 0;

        // Perhitungan Persentase Float: 100% - % Held by Insiders
        // Kita gunakan (1 - insiderPercentRaw) * 100
        let floatPercent = 0;
        
        if (insiderPercentRaw > 0) {
          floatPercent = (1 - insiderPercentRaw) * 100;
        } else if (outstandingRaw > 0 && floatRaw > 0) {
          floatPercent = (floatRaw / outstandingRaw) * 100;
        }

        // Hitung % Institutional terhadap FREE FLOAT
        // Rumus: (Inst % Total * Outstanding) / Float_Lembar
        let instPercentOfFloat = 0;
        if (floatRaw > 0 && instPercentTotalRaw > 0) {
          const instShares = instPercentTotalRaw * outstandingRaw;
          instPercentOfFloat = (instShares / floatRaw) * 100;
        }

        // Penanganan Anomali Data
        let finalStatus = "Sukses";
        return {
            status: finalStatus,
            ticker: symbol,
            marketCap: marketCapRaw, 
            outstanding: outstandingRaw, 
            instPercentOfFloat: Number(instPercentOfFloat.toFixed(2)), 
            insiderPercent: parseFloat(insiderPercentRaw.toFixed(2)),
            floatPercent: parseFloat(floatPercent.toFixed(2))
        };

    } catch (error) {
        return { ticker, status: "Error", };
    }
}
