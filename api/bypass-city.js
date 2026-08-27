const axios = require('axios');

const API_BASE_URL = 'https://api2.bypass.city';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function bypassLink(targetUrl) {
  try {
    const response = await axios.get(`${API_BASE_URL}/bypass`, {
      params: { bypass: targetUrl },
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Referer': 'https://bypass.city/',
        'Origin': 'https://bypass.city'
      },
      timeout: 20000
    });

    const data = response.data;

    if (!data) {
      return { status: false, error: "Tidak ada respons dari server bypass" };
    }

    const bypassedUrl = data.data || data.bypassed || data.destination || null;
    const pasteContent = data.paste || null;

    if (!bypassedUrl && !pasteContent) {
      return {
        status: false,
        error: "Gagal melewati proteksi link atau butuh verifikasi captcha di situs asal"
      };
    }

    return {
      status: true,
      result: {
        original_url: targetUrl,
        bypassed_url: bypassedUrl,
        paste_content: pasteContent
      }
    };
  } catch (error) {
    try {
      const fallbackRes = await axios.get(`https://api.bypass.city/bypass`, {
        params: { bypass: targetUrl },
        headers: { 'User-Agent': UA },
        timeout: 20000
      });

      if (fallbackRes.data && (fallbackRes.data.data || fallbackRes.data.destination)) {
        return {
          status: true,
          result: {
            original_url: targetUrl,
            bypassed_url: fallbackRes.data.data || fallbackRes.data.destination,
            paste_content: fallbackRes.data.paste || null
          }
        };
      }
    } catch (e) {}

    return {
      status: false,
      error: error.response?.data?.message || error.message || "Gagal melakukan bypass pada link tersebut"
    };
  }
}

module.exports = [
  {
    name: "Bypass City",
    desc: "Lewati iklan dan shortlink berantai (Bypass.city / Linkvertise / AdFly / dll)",
    category: "Bypass",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      url: { 
        type: "string", 
        required: true, 
        example: "https://linkvertise.com/12345/example" 
      }
    },
    path: "/api/bypass/city",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url wajib diisi" });
      }

      const validUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') 
        ? targetUrl 
        : `https://${targetUrl}`;

      const result = await bypassLink(validUrl);
      return res.json(result);
    }
  }
];
