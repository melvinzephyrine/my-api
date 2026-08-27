const axios = require('axios');
const cheerio = require('cheerio');

async function sfile(url) {
  const headers = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K)',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'id-ID,id;q=0.9,en;q=0.8'
  };

  const r1 = await axios.get(url, { headers, timeout: 15000 });
  const cookie = (r1.headers['set-cookie'] || []).map(v => v.split(';')[0]).join('; ');
  if (cookie) headers.cookie = cookie;

  let $ = cheerio.load(r1.data);

  const file_name = $('h1').first().text().trim() || null;
  const size_from_text = r1.data.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB))/i)?.[1] || null;

  const infoText = $('meta[property="og:description"]').attr('content') || '';

  const author_name = infoText.match(/uploaded by\s([^ ]+)/i)?.[1] || null;
  const upload_date = infoText.match(/on\s(\d+\s[A-Za-z]+\s\d{4})/i)?.[1] || null;

  const download_count =
    $('span')
      .filter((_, el) => $(el).text().toLowerCase().includes('download'))
      .first()
      .text()
      .match(/\d+/)?.[0] || null;

  const pageurl = $('meta[property="og:url"]').attr('content');
  if (!pageurl) {
    return {
      file_name,
      file_size: size_from_text,
      author: author_name,
      upload_date,
      download_count,
      download_url: null
    };
  }

  headers.referer = url;
  const r2 = await axios.get(pageurl, { headers, timeout: 15000 });
  $ = cheerio.load(r2.data);

  const gateUrl = $('#download').attr('href');
  if (!gateUrl) {
    return {
      file_name,
      file_size: size_from_text,
      author: author_name,
      upload_date,
      download_count,
      download_url: null
    };
  }

  headers.referer = pageurl;
  const r3 = await axios.get(gateUrl, { headers, timeout: 15000 });

  const scripts = cheerio
    .load(r3.data)('script')
    .map((_, el) => cheerio.load(el).html())
    .get()
    .join('\n');

  const final = scripts.match(/https:\\\/\\\/download\d+\.sfile\.(?:co|mobi)\\\/downloadfile\\\/\d+\\\/\d+\\\/[a-z0-9]+\\\/[^"'\\\s]+(\?[^"']+)?/i);

  const download_url = final ? final[0].replace(/\\\//g, '/') : null;

  return {
    file_name,
    file_size: size_from_text,
    author: author_name,
    upload_date,
    download_count,
    download_url
  };
}

module.exports = [
  {
    name: "Sfile Mobi Downloader",
    desc: "Unduh file dari sfile.mobi / sfile.co secara langsung",
    category: "Downloader",
    method: "GET",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      url: { 
        type: "string", 
        required: true, 
        example: "https://sfile.co/xxxxx" 
      }
    },
    path: "/api/download/sfile",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter URL Sfile wajib diisi" });
      }

      try {
        const result = await sfile(targetUrl);

        if (!result.download_url) {
          return res.json({
            status: false,
            error: "Gagal mendapatkan direct link download dari Sfile"
          });
        }

        return res.json({
          status: true,
          result: result
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Terjadi kesalahan saat memproses link Sfile"
        });
      }
    }
  }
];
