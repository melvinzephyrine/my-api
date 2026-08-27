const https = require('https');
const http = require('http');
const { URL } = require('url');

function fetchImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(imageUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.get(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
        'Accept': 'image/*,*/*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageAsBase64(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const contentType = res.headers['content-type'] || 'image/jpeg';
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        base64: `data:${contentType};base64,${Buffer.concat(chunks).toString('base64')}`,
        rawBuffer: Buffer.concat(chunks)
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function removeBackground(encodedImage, title = 'image.jpg') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ encodedImage, title, mimeType: 'image/jpeg' });
    const options = {
      hostname: 'background-remover.com',
      path: '/removeImageBackground',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
        'Referer': 'https://background-remover.com/upload',
        'Accept': '*/*',
        'Origin': 'https://background-remover.com',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        if (res.statusCode !== 200) return reject(new Error(`API ${res.statusCode}`));
        const ct = res.headers['content-type'] || '';
        if (ct.includes('image/')) { resolve({ _rawBuffer: raw }); return; }
        try { resolve(JSON.parse(raw.toString())); }
        catch { resolve({ result: raw.toString() }); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function uploadBufferToCloud(fileBuffer, filename = 'no-bg.png') {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    const mimeType = 'image/png';
    const header = Buffer.from([
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="files[]"; filename="${filename}"\r\n`,
      `Content-Type: ${mimeType}\r\n`,
      `\r\n`,
    ].join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const options = {
      hostname: 'clooud.my.id',
      path: '/uploder/',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'User-Agent': 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
        'Accept': '*/*',
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('Upload parse error')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function processRemoveBg(imageUrl) {
  try {
    const imageData = await fetchImageAsBase64(imageUrl);
    const response = await removeBackground(imageData.base64, 'image.jpg');

    let outputBuffer = null;

    if (response._rawBuffer) {
      outputBuffer = response._rawBuffer;
    } else {
      const resultData =
        response.encodedImageWithoutBackground ||
        response.image || response.resultImage ||
        response.output || response.data || response.result || null;

      if (!resultData) throw new Error('Gagal mengekstrak data gambar hasil hapus background');

      if (typeof resultData === 'string' && resultData.startsWith('http')) {
        const resData = await fetchImageAsBase64(resultData);
        outputBuffer = resData.rawBuffer;
      } else if (typeof resultData === 'string') {
        const b64 = resultData.replace(/^data:[^;]+;base64,/, '').trim();
        outputBuffer = Buffer.from(b64, 'base64');
      } else {
        throw new Error('Format hasil gambar tidak dikenal');
      }
    }

    const uploadResult = await uploadBufferToCloud(outputBuffer);
    const resultUrl =
      uploadResult?.files?.[0]?.url ||
      uploadResult?.url             ||
      uploadResult?.data?.url       ||
      null;

    if (!resultUrl) throw new Error('Gagal mengunggah hasil gambar ke cloud');

    return {
      status: true,
      result: {
        original_url: imageUrl,
        no_bg_url: resultUrl
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message || 'Gagal menghapus background gambar'
    };
  }
}

module.exports = [
  {
    name: "Remove Background",
    desc: "Hapus background gambar/foto secara otomatis",
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
        example: "https://example.jpg" 
      }
    },
    path: "/api/tools/removebg",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const imageUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!imageUrl) {
        return res.json({ status: false, error: "Parameter url gambar wajib diisi" });
      }

      const result = await processRemoveBg(imageUrl);
      return res.json(result);
    }
  }
];
