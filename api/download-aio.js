const axios = require("axios");
const CryptoJS = require("crypto-js");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");
const { shz: bycf } = require("bycf");

const CONFIG = {
  baseUrl: "https://allinonedownloader.com",
  siteKey: "0x4AAAAAACm5JpnQ9wkl8EIR",
  userAgent:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
};

const AES_IV_HEX = "afc4e290725a3bf0ac4d3ff826c43c10";

function encryptUrl(url, token) {
  try {
    const key = CryptoJS.enc.Hex.parse(token);
    const iv = CryptoJS.enc.Hex.parse(AES_IV_HEX);

    const encrypted = CryptoJS.AES.encrypt(url, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.ZeroPadding
    });

    return encrypted.toString();
  } catch (err) {
    throw new Error(err.message);
  }
}

async function aioDownloader(targetUrl) {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      headers: {
        "User-Agent": CONFIG.userAgent,
        Accept: "application/json, text/javascript, */*; q=0.01"
      }
    })
  );

  const targetPage = `${CONFIG.baseUrl}/in/`;
  const ttoken = await bycf.turnstileMin(targetPage, CONFIG.siteKey);

  if (!ttoken) {
    throw new Error("Modul bycf gagal mengembalikan ttoken.");
  }

  const pageRes = await client.get(targetPage, {
    headers: { Referer: CONFIG.baseUrl },
    timeout: 90000
  });

  const sccMatch = pageRes.data.match(/id=["']scc["'][^>]*value=["']([^"']+)["']/i);
  if (!sccMatch || !sccMatch[1]) {
    throw new Error("Input #scc tidak ditemukan.");
  }
  const endpointPath = sccMatch[1];

  const tokenMatch = pageRes.data.match(/id=["']token["'][^>]*value=["']([^"']+)["']/i);
  if (!tokenMatch || !tokenMatch[1]) {
    throw new Error("Input #token tidak ditemukan.");
  }
  const pageToken = tokenMatch[1];
  const urlHash = encryptUrl(targetUrl, pageToken);

  const formData = new URLSearchParams();
  formData.append("url", targetUrl);
  formData.append("token", pageToken);
  formData.append("urlhash", urlHash);
  formData.append("ttoken", ttoken);

  const res = await client.post(
    `${CONFIG.baseUrl}${endpointPath}`,
    formData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: CONFIG.baseUrl,
        Referer: targetPage,
        "X-Requested-With": "XMLHttpRequest"
      },
      timeout: 90000
    }
  );

  return res.data;
}

module.exports = [
  {
    name: "AIO Downloader",
    desc: "Mengunduh media dari berbagai platform sosial media hanya dengan satu endpoint.",
    category: "Downloader",
    parameters: {
      apikey: { type: "string" },
      url: { type: "string" }
    },
    path: "/api/download/aio",
    async run(req, res) {
      const { apikey, url } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Url is required" });
      }

      try {
        const result = await aioDownloader(url);

        res.json({
          status: true,
          creator: "t.me/luyatiem",
          result
        });
      } catch (err) {
        res.status(500).json({
          status: false,
          creator: "t.me/luyatiem",
          error: err.message
        });
      }
    }
  }
];
