const axios = require('axios');
const cheerio = require('cheerio');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.mediafire.com/',
  'Upgrade-Insecure-Requests': '1'
};

async function mediafiredl(url) {
  try {
    const res = await axios.get(url, { headers, maxRedirects: 5, timeout: 15000 });
    const $ = cheerio.load(res.data);
    
    const download = $('#download_link > a.input.popsok').attr('href') || $('#downloadButton').attr('href') || null;
    const filename = $('.dl-btn-label').first().text().trim() || null;
    const filesize = $('#download_link > a.input.popsok')
      .text()
      .match(/\(([^)]+)\)/)?.[1] || null;
    const filetype = $('.dl-info .filetype span')
      .first()
      .text()
      .trim() || null;
    const uploaded = $('.details li')
      .eq(1)
      .find('span')
      .text()
      .trim() || null;

    if (!download) {
      return {
        status: false,
        error: "Link download tidak ditemukan atau file telah dihapus dari MediaFire"
      };
    }

    return {
      status: true,
      result: {
        filename,
        filetype,
        filesize,
        uploaded,
        download
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message || "Gagal mengambil data dari MediaFire"
    };
  }
}

module.exports = [
  {
    name: "MediaFire Downloader",
    desc: "Unduh file dari MediaFire secara langsung dengan informasi detail seperti nama file, ukuran, tipe file, dan tanggal upload.",
    category: "Downloader",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      url: { 
        type: "string", 
        required: true, 
        example: "https://www.mediafire.com/file/xxx/xxx.zip/file" 
      }
    },
    path: "/api/download/mediafire",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url MediaFire wajib diisi" });
      }

      if (!targetUrl.includes('mediafire.com')) {
        return res.json({ status: false, error: "URL yang dimasukkan bukan link MediaFire yang valid" });
      }

      const result = await mediafiredl(targetUrl);
      return res.json(result);
    }
  }
];
