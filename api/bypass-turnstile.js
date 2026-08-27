const { shz: bycf } = require('bycf');

async function solveTurnstileMin(targetUrl, sitekey) {
  try {
    const token = await bycf.turnstileMin(targetUrl, sitekey);

    if (!token) {
      return {
        status: false,
        error: "Gagal menyelesaikan Turnstile captcha atau token tidak didapatkan"
      };
    }

    return {
      status: true,
      result: {
        url: targetUrl,
        sitekey: sitekey,
        token: token
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message || "Terjadi kesalahan saat memproses Turnstile"
    };
  }
}

module.exports = [
  {
    name: "Bypass Turnstile Min",
    desc: "Bypass Turnstile Captcha secara otomatis menggunakan URL target & Sitekey Cloudflare",
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
        example: "https://web-target.com" 
      },
      sitekey: {
        type: "string",
        required: true,
        example: "0x4AAAAAA..."
      }
    },
    path: "/api/bypass/turnstile-min",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;
      const sitekey = req.query.sitekey || req.body?.sitekey;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl || !sitekey) {
        return res.json({ status: false, error: "Parameter url dan sitekey wajib diisi" });
      }

      const validUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') 
        ? targetUrl 
        : `https://${targetUrl}`;

      const result = await solveTurnstileMin(validUrl, sitekey);
      return res.json(result);
    }
  }
];
