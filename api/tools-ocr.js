const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const BASE = 'https://imagetotext.my';
const API = `${BASE}/index.php`;
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif',  '.webp': 'image/webp',  '.bmp': 'image/bmp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff',  '.pdf': 'application/pdf',
};

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': `${BASE}/`,
  'Origin': BASE,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

let _cookieCache = null;

async function fetchCookie() {
  if (_cookieCache) return _cookieCache;

  const res = await fetch(BASE, { method: 'GET', headers: BASE_HEADERS, redirect: 'follow' });

  let cookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    cookies = res.headers.getSetCookie();
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) cookies = raw.split(/,(?=[^ ])/).map(s => s.trim());
  }

  const loginCookie = cookies
    .map(c => c.split(';')[0].trim())
    .find(c => c.startsWith('login='));

  if (!loginCookie) throw new Error('Gagal mengambil session cookie dari server target');

  _cookieCache = loginCookie;
  return loginCookie;
}

function clearCookieCache() {
  _cookieCache = null;
}

async function upload(input, name) {
  const cookie = await fetchCookie();
  const buf = typeof input === 'string' ? fs.readFileSync(input) : input;
  const filename = name || (typeof input === 'string' ? path.basename(input) : 'image.png');
  const mime = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const boundary = `----OCR${Date.now()}`;

  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="op"\r\n\r\nupload_direct\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buf, tail]);

  const headers = {
    ...BASE_HEADERS,
    'Cookie': cookie,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(body.length),
  };

  const res = await fetch(API, { method: 'POST', headers, body });
  const json = await res.json();

  if (!json?.success) {
    clearCookieCache();
    throw new Error(
      json?.error === 'file_too_large'
        ? 'File terlalu besar (maksimal 10 MB)'
        : json?.message || 'Upload file gagal'
    );
  }

  const { key, file_id, url } = json.data;
  if (!key || !file_id) throw new Error('Response upload tidak valid');
  return { fileId: String(file_id), key, url };
}

async function poll(fileId, key, timeout = 5 * 60 * 1000) {
  const cookie = await fetchCookie();
  const params = new URLSearchParams({
    op: 'status', action: 'check_task_status',
    file_id: fileId, filename: key,
  });
  const headers = { ...BASE_HEADERS, 'Cookie': cookie };
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeout)
      throw new Error(`Timeout proses OCR setelah ${Math.round((Date.now() - start) / 1000)} detik`);

    try {
      const res = await fetch(`${API}?${params}`, { headers });
      const json = await res.json();
      const data = json?.data || json || {};
      const status = String(data.status || '').toLowerCase();

      if (['completed', 'complete', 'done', 'success'].includes(status)) {
        const r = data.result || data;
        return { text: r.ocr_text || r.text || '', confidence: r.confidence ?? null, language: r.language ?? null };
      }
      if (status.includes('fail') || status.includes('error'))
        throw new Error(`OCR error: ${status}`);
    } catch (e) {
      if (e.message.startsWith('OCR error') || e.message.startsWith('Timeout')) throw e;
    }

    await sleep(2000);
  }
}

async function extractText(filePath, originalName) {
  const name = originalName || path.basename(filePath);
  const { fileId, key } = await upload(filePath, name);
  const result = await poll(fileId, key);
  return { text: result.text, confidence: result.confidence, language: result.language, fileId };
}

module.exports = [
  {
    name: "OCR",
    desc: "Ekstrak tulisan teks dari gambar (JPG, PNG, WebP) atau dokumen (PDF)",
    category: "Tools",
    method: "POST",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      file: { 
        type: "file", 
        required: true 
      }
    },
    path: "/api/tools/ocr",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const uploadedFile = req.files && req.files.length > 0 ? req.files[0] : null;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!uploadedFile || !uploadedFile.path) {
        return res.json({ status: false, error: "Wajib mengunggah file gambar atau PDF (form-data: file)" });
      }

      const tempPath = uploadedFile.path;

      try {
        const ocrResult = await extractText(tempPath, uploadedFile.originalname);

        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }

        return res.json({
          status: true,
          result: {
            filename: uploadedFile.originalname,
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            language: ocrResult.language,
            file_id: ocrResult.fileId
          }
        });

      } catch (err) {
        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }
        return res.json({
          status: false,
          error: err.message || "Gagal memproses OCR pada file"
        });
      }
    }
  }
];
