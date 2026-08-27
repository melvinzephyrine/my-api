const axios = require('axios');

async function takeScreenshot(targetUrl, opts = {}) {
  const {
    format = 'jpg',
    width = 1280,
    height = 1200,
    scale = 100,
    zoom = 100,
    fullSize = false,
    delay = 3000
  } = opts;

  const params = new URLSearchParams();
  params.set('u', targetUrl);
  params.set('tkn', '125');
  params.set('d', delay);
  params.set('fs', fullSize ? 1 : 0);
  params.set('w', width);
  params.set('h', height);
  params.set('s', scale);
  params.set('z', zoom);
  params.set('f', String(format).replace(/^\./, ''));
  params.set('rt', 'jweb');

  try {
    const response = await axios.get(`https://api.pikwy.com/?${params.toString()}`, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 60000
    });

    const data = response.data;

    if (data.code) {
      return { status: false, error: data.mesg || "Gagal mengambil screenshot website" };
    }

    const screenshotUrl = data.iurl || data.image || data.pdf || data.url || null;

    if (!screenshotUrl) {
      return { status: false, error: "Gagal memproses gambar screenshot dari server target" };
    }

    return {
      status: true,
      result: {
        url: targetUrl,
        format: format,
        full_size: fullSize,
        screenshot_url: screenshotUrl
      }
    };
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return {
        status: false,
        error: "Proses screenshot memakan waktu terlalu lama. Coba matikan opsi fullPage atau gunakan link website yang lebih ringan."
      };
    }
    return {
      status: false,
      error: error.response?.data?.mesg || error.message || "Terjadi kesalahan saat memproses screenshot"
    };
  }
}

module.exports = [
  {
    name: "Screenshot Website",
    desc: "Ambil tangkapan layar (screenshot) tampilan website lengkap ke format JPG, PNG, atau PDF",
    category: "Tools",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      url: { 
        type: "string", 
        required: true, 
        example: "https://google.com" 
      },
      format: { 
        type: "select", 
        required: false, 
        selection: ["jpg", "png", "pdf"],
        value: "jpg" 
      },
      fullPage: {
        type: "select",
        required: false,
        selection: ["false", "true"],
        value: "false"
      }
    },
    path: "/api/tools/ssweb",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;
      const format = req.query.format || req.body?.format || "jpg";
      const fullPage = (req.query.fullPage || req.body?.fullPage) === "true";

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url website wajib diisi" });
      }

      const validUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') 
        ? targetUrl 
        : `https://${targetUrl}`;

      const result = await takeScreenshot(validUrl, {
        format: ["jpg", "png", "pdf"].includes(format) ? format : "jpg",
        fullSize: fullPage
      });

      return res.json(result);
    }
  }
];
