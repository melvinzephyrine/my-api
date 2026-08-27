const axios = require("axios");
const cheerio = require("cheerio");
const FormData = require("form-data");

const BASE_URL = "https://malz-official.biz.id/slf/";

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1"
];

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min = 500, max = 1500) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bypassShortLink(shortUrl) {
  if (!shortUrl) {
    throw new Error("Short URL required");
  }

  const homeRes = await axios.get(BASE_URL, {
    headers: {
      "User-Agent": randomUserAgent(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    timeout: 15000
  });

  const cookies = homeRes.headers["set-cookie"]
    ?.map(c => c.split(";")[0])
    .join("; ") || "";

  await sleep(getRandomDelay(800, 1200));

  const form = new FormData();
  form.append("url", shortUrl);

  const postRes = await axios.post(BASE_URL, form, {
    headers: {
      ...form.getHeaders(),
      "User-Agent": randomUserAgent(),
      Cookie: cookies,
      Origin: BASE_URL.replace(/\/$/, ""),
      Referer: BASE_URL
    },
    timeout: 20000,
    validateStatus: () => true
  });

  const html = postRes.data;
  const $ = cheerio.load(html);

  const originalUrl = $("#originalUrl").text().trim() || 
                     $(".result-url").eq(0).text().trim();

  const destinationUrl = $("#destinationUrl").text().trim() || 
                        $(".result-url").eq(1).text().trim();

  if (!destinationUrl) {
    throw new Error("Destination URL not found in response");
  }

  return {
    originalUrl: originalUrl || shortUrl,
    destinationUrl: destinationUrl
  };
}

module.exports = [
  {
    name: "Bypass Sfl.gl",
    desc: "Skip tautan pendek seperti sfl.gl dan sejenisnya",
    category: "Bypass",
    parameters: {
      apikey: { type: "string" },
      url: { type: "string" }
    },
    path: "/api/bypass/sflgl",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      let url = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Url shortlink wajib diisi" });
      }

      try {
        let cleanUrl = decodeURIComponent(url).trim();
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          cleanUrl = "https://" + cleanUrl.replace(/^https?:\/*/, "");
        }

        const data = await bypassShortLink(cleanUrl);

        res.json({
          status: true,
          result: data
        });
      } catch (err) {
        res.status(500).json({
          status: false,
          error: err.message || "Terjadi kesalahan saat bypass shortlink"
        });
      }
    }
  }
];
