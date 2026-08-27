const axios = require('axios');
const { shz: bycf } = require('bycf');

class ExportTokScraper {
    constructor() {
        this.targetVerifyUrl = 'https://exporttok.com/api/turnstile/verify';
        this.siteKey = '0x4AAAAAADFQwHc863EN8FET';
        this.userAgent = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
    }

    async getTurnstileToken() {
        try {
            const result = await bycf.turnstileMin(this.targetVerifyUrl, this.siteKey);
            
            const token = typeof result === 'object' ? (result.token || result.result || result) : result;

            if (token) {
                return token;
            }
            throw new Error('Gagal mendapatkan token Turnstile dari package bycf.');
        } catch (err) {
            throw new Error(`[bycf Error]: ${err.message}`);
        }
    }

    async verifyTurnstile(cfToken) {
        const res = await axios.post(
            this.targetVerifyUrl,
            { token: cfToken },
            {
                headers: {
                    'User-Agent': this.userAgent,
                    'Origin': 'https://exporttok.com',
                    'Referer': 'https://exporttok.com/tiktok/account/search',
                    'Content-Type': 'application/json'
                }
            }
        );

        if (res.data?.sessionToken) {
            return res.data.sessionToken;
        }
        throw new Error('Response verify tidak mengembalikan sessionToken.');
    }

    async searchTikTokUser(keyword, cursor = 0) {
        const cfToken = await this.getTurnstileToken();
        const sessionToken = await this.verifyTurnstile(cfToken);

        const searchUrl = 'https://exporttok.com/api/tiktok/search';
        const res = await axios.get(searchUrl, {
            params: {
                keyword: keyword,
                cursor: cursor,
                type: 'user'
            },
            headers: {
                'User-Agent': this.userAgent,
                'Origin': 'https://exporttok.com',
                'Referer': `https://exporttok.com/tiktok/account/search?q=${encodeURIComponent(keyword)}`,
                'X-Turnstile-Token': sessionToken
            }
        });

        if (res.data?.code === 0 && res.data?.data) {
            return res.data.data.user_list || [];
        }
        throw new Error(res.data?.msg || 'Gagal mengambil data user.');
    }
}

const scraper = new ExportTokScraper();

module.exports = [
  {
    name: "TikTok Stalk",
    desc: "Stalk atau cari profil pengguna TikTok",
    category: "Stalker",
    parameters: {
      apikey: { type: "string" },
      username: { type: "string" }
    },
    path: "/api/stalk/tiktok",
    async run(req, res) {
      const { apikey, username } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!username) {
        return res.json({ status: false, error: "Username is required" });
      }

      try {
        const result = await scraper.searchTikTokUser(username);

        res.json({
          status: true,
          result
        });
      } catch (err) {
        res.status(500).json({
          status: false,
          error: err.message
        });
      }
    }
  }
];
