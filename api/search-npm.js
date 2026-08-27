const axios = require('axios');

async function searchNpmPackage(query, limit = 20) {
  try {
    const size = Math.min(parseInt(limit, 10) || 20, 100);
    const response = await axios.get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'accept': 'application/json',
        'accept-encoding': 'gzip, deflate, br',
      }
    });

    const data = response.data;

    const result = data?.objects?.map((obj) => ({
      name: obj.package?.name,
      version: obj.package?.version,
      description: obj.package?.description,
      license: obj.package?.license,
      author: obj.package?.author?.name || null,
      date: obj.package?.date,
      links: obj.package?.links,
      keywords: obj.package?.keywords || [],
      searchScore: obj.score?.detail?.matchedFields?.length || obj.score?.final,
      maintainers: obj.package?.maintainers?.map((m) => m.username) || [],
    })) || [];

    return {
      status: true,
      total: data?.total || result.length,
      result: result
    };
  } catch (error) {
    return {
      status: false,
      error: error.response?.data?.message || error.message || 'Gagal mencari paket NPM'
    };
  }
}

module.exports = [
  {
    name: "NPM Package Search",
    desc: "Cari informasi library/paket NodeJS dari registry resmi NPM",
    category: "Search",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      query: { 
        type: "string", 
        required: true, 
        example: "express" 
      },
      size: { 
        type: "number", 
        required: false, 
        example: "20" 
      }
    },
    path: "/api/search/npm",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const query = req.query.query || req.body?.query || req.query.q;
      const size = req.query.size || req.body?.size || 20;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Parameter query wajib diisi" });
      }

      const result = await searchNpmPackage(query, size);
      return res.json(result);
    }
  }
];
