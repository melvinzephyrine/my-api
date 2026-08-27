const axios = require("axios");
const cheerio = require("cheerio");

class TikDownloader {
  async search(url, lang = "en") {
    const body = new URLSearchParams({ q: url, lang });
    const res = await axios({
      method: "POST",
      url: "https://tikdownloader.io/api/ajaxSearch",
      data: body,
      headers: {
        accept: "*/*",
        "accept-language": "ms-MY",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://tikdownloader.io",
        priority: "u=1, i",
        referer: "https://tikdownloader.io/en",
        "sec-ch-ua":
          '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Fgsi Scraper",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    if (!res.data?.data) throw new Error("Gagal mengambil data dari TikTok Downloader");
    return this.parse(res.data.data);
  }

  parse(html) {
    const $ = cheerio.load(html);

    const thumbnail = $(".thumbnail .image-tik img").attr("src");
    const title = $(".content h3").text().trim();
    const tiktokId = $("#TikTokId").val();

    const downloads = [];
    $(".dl-action a.tik-button-dl").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      const text = $el.text().trim();
      const type = text.includes("MP3") ? "mp3" : "mp4";
      let quality = "unknown";
      if (text.includes("HD")) quality = "hd";
      else if (text.includes("[1]")) quality = "sd";
      else if (text.includes("[2]")) quality = "sd2";
      downloads.push({ type, quality, url: href, label: text });
    });

    const videoSrc = $("#vid").attr("data-src");
    const poster = $("#vid").attr("poster");

    return {
      thumbnail,
      title,
      tiktokId,
      downloads,
      videoSrc,
      poster,
    };
  }
}

const tikDownloaderInstance = new TikDownloader();

module.exports = [
  {
    name: "TikTok Downloader V2",
    desc: "Download video dari TikTok tanpa watermark atau audio MP3",
    category: "Downloader",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      url: { type: "string", required: true, example: "https://vt.tiktok.com/xxxxx/" }
    },
    path: "/api/download/tiktokv2",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const url = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "URL TikTok wajib diisi" });
      }

      try {
        const result = await tikDownloaderInstance.search(url);

        return res.json({
          status: true,
          result
        });
      } catch (err) {
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal mengunduh media dari TikTok"
        });
      }
    }
  }
];
