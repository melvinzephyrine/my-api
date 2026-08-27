const axios = require('axios');

async function pinterestSearch(query) {
    if (!query) throw new Error("Parameter query tidak boleh kosong.");
    
    try {
        const cleanQuery = query.trim();
        const searchPath = `/search/pins/?q=${encodeURIComponent(cleanQuery)}&rs=rs`;

        const payload = {
            options: {
                query: cleanQuery,
                rs: "rs",
                scope: "pins",
                redux_normalize_feed: true,
                source_url: searchPath
            },
            context: {}
        };

        const url = `https://id.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(searchPath)}&rs=rs&data=${encodeURIComponent(JSON.stringify(payload))}`;

        const response = await axios.get(url, {
            headers: {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "x-pinterest-appstate": "active",
                "x-pinterest-pws-handler": "www/search/[scope].js",
                "x-requested-with": "XMLHttpRequest",
                "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
                "referer": "https://id.pinterest.com/",
                "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
            }
        });

        const data = response.data;
        const results = data.resource_response?.data?.results || [];

        if (results.length === 0) return [];

        return results.map((pin) => ({
            id: pin.id,
            title: pin.seo_alt_text || pin.title || "No Title",
            image: pin.images?.["736x"]?.url || pin.images?.["474x"]?.url || pin.images?.["236x"]?.url || pin.images?.orig?.url || null,
            board: pin.board?.name || "-",
            username: pin.pinner?.username || "-",
            source: `https://id.pinterest.com/pin/${pin.id}/`
        })).filter((item) => item.image !== null);
    }
    catch (error) {
        throw new Error(error.response?.data?.resource_response?.error?.message || error.message);
    }
}

module.exports = [
    {
        name: "Pinterest Search",
        desc: "Cari gambar dan media dari Pinterest berdasarkan kata kunci",
        category: "Search",
        method: "GET",
        parameters: {
            apikey: { type: "string", required: true },
            query: { type: "string", required: true, example: "pp couple" },
            limit: { type: "string", required: false, example: "20" }
        },
        path: "/api/search/pinterest",
        async run(req, res) {
            const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
            const query = req.query.query || req.body?.query;
            const limit = parseInt(req.query.limit || req.body?.limit || 20);

            if (!global.apikey.includes(apikey)) {
                return res.json({ status: false, error: "Apikey invalid" });
            }

            if (!query) {
                return res.json({ status: false, error: "Query pencarian wajib diisi" });
            }

            try {
                let results = await pinterestSearch(query);

                if (limit && !isNaN(limit)) {
                    results = results.slice(0, limit);
                }

                return res.json({
                    status: true,
                    total: results.length,
                    result: results
                });

            } catch (err) {
                return res.status(500).json({
                    status: false,
                    error: err.message || "Gagal melakukan pencarian di Pinterest"
                });
            }
        }
    }
];
