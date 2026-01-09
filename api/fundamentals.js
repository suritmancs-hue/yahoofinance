async function fetchFundamentalData(ticker) {
    try {
        const symbol = ticker.toUpperCase().trim();
        
        const result = await yahooFinance.quoteSummary(symbol, {
            modules: ['defaultKeyStatistics', 'summaryDetail']
        });

        if (!result) {
            return { ticker: symbol, status: "Not Found", note: "No Data" };
        }

        const stats = result.defaultKeyStatistics || {};
        const summary = result.summaryDetail || {};

        const marketCapRaw = summary.marketCap || 0;
        const outstandingRaw = stats.impliedSharesOutstanding || stats.sharesOutstanding || 0;
        const floatRaw = stats.floatShares || 0;

        // FIX: Langsung ambil nilainya karena yahoo-finance2 sudah melakukan parsing otomatis
        // Jika stats.heldPercentInsiders adalah objek, ambil .raw. Jika angka, ambil langsung.
        const insiderPercentRaw = (typeof stats.heldPercentInsiders === 'object') ? (stats.heldPercentInsiders.raw || 0) : (stats.heldPercentInsiders || 0);
        const instPercentTotalRaw = (typeof stats.heldPercentInstitutions === 'object') ? (stats.heldPercentInstitutions.raw || 0) : (stats.heldPercentInstitutions || 0);

        // 1. Perhitungan Persentase Float: 100% - % Insider
        let floatPercent = (1 - insiderPercentRaw) * 100;
        
        // Fallback jika insider 0 tetapi ada data float lembaran
        if (insiderPercentRaw === 0 && outstandingRaw > 0 && floatRaw > 0) {
            floatPercent = (floatRaw / outstandingRaw) * 100;
        }

        // 2. Hitung % Institutional terhadap FREE FLOAT
        let instPercentOfFloat = 0;
        if (floatRaw > 0) {
            // (Total Institusi % * Total Saham) / Saham Float Publik
            const instShares = instPercentTotalRaw * outstandingRaw;
            instPercentOfFloat = (instShares / floatRaw) * 100;
        }

        // Penanganan Anomali
        let finalStatus = "Sukses";
        return {
            status: finalStatus,
            note: note.trim(),
            ticker: symbol,
            marketCap: marketCapRaw, 
            outstanding: outstandingRaw, 
            instPercentOfFloat: parseFloat(instPercentOfFloat.toFixed(2)), 
            insiderPercent: parseFloat((insiderPercentRaw * 100).toFixed(2)),
            floatPercent: parseFloat(floatPercent.toFixed(2))
        };

    } catch (error) {
        return { ticker, status: "Error", note: error.message };
    }
}
