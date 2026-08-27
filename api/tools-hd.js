const axios = require('axios');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const FormData = require('form-data');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwlO+boC6cwRo3UfXVBadaYwcX
0zKS2fuVNY2qZ0dgwb1NJ+/Q9FeAosL4ONiosD71on3PVYqRUlL5045mvH2K9i8b
AFVMEip7E6RMK6tKAAif7xzZrXnP1GZ5Rijtqdgwh+YmzTo39cuBCsZqK9oEoeQ3
r/myG9S+9cR5huTuFQIDAQAB
-----END PUBLIC KEY-----`;

const APP_ID = "aifaceswap";
const U_ID = "1H5tRtzsBkqXcaJ";
const FN_NAME = "demo-image-upscaler";
const BRAND_KEY = "8f3f0c7387123ae0";

function generateRandomString(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let res = "";
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

function aesenc(data, key) {
  const k = CryptoJS.enc.Utf8.parse(key);
  const encrypted = CryptoJS.AES.encrypt(data, k, {
    iv: k,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return encrypted.toString();
}

function rsaenc(data) {
  const buffer = Buffer.from(data, 'utf8');
  const encrypted = crypto.publicEncrypt({
    key: PUBLIC_KEY,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  }, buffer);
  return encrypted.toString('base64');
}

function gencryptoheaders(type, fp = null) {
  const e = new Date();
  const n = Math.floor(new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate(), e.getUTCHours(), e.getUTCMinutes(), e.getUTCSeconds()).getTime() / 1000);
  const r = crypto.randomUUID();
  const i = generateRandomString(16);
  const fingerPrint = fp || crypto.randomBytes(16).toString('hex');
  const s = rsaenc(i);
  let signStr = (type === 'upload') ? `${APP_ID}:${r}:${s}` : `${APP_ID}:${U_ID}:${n}:${r}:${s}`;
  return {
    'fp': fingerPrint,
    'fp1': aesenc(`${APP_ID}:${fingerPrint}`, i),
    'x-guide': s,
    'x-sign': aesenc(signStr, i),
    'x-code': Date.now().toString()
  };
}

async function upimageFromUrl(url) {
  const cryptoHeaders = gencryptoheaders('upload');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
  const buffer = Buffer.from(response.data);

  const form = new FormData();
  form.append('file', buffer, { filename: 'input.jpg', contentType: 'image/jpeg' });
  form.append('fn_name', FN_NAME);
  form.append('request_from', '9');
  form.append('origin_from', BRAND_KEY);

  const res = await axios.post('https://app-v1.live3d.io/aitools/upload-img', form, {
    headers: {
      ...form.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      'origin': 'https://live3d.io',
      'referer': 'https://live3d.io/',
      'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
      ...cryptoHeaders
    },
    timeout: 30000
  });

  if (!res.data?.data?.path) {
    throw new Error('Gagal mengunggah gambar ke server Live3D');
  }

  return { path: res.data.data.path, fp: cryptoHeaders.fp };
}

async function createJob(imgRemote, scale = 4, fp) {
  const cryptoHeaders = gencryptoheaders('create', fp);
  const payload = {
    fn_name: FN_NAME,
    call_type: 3,
    input: {
      source_image: imgRemote,
      scale: scale,
      request_from: 9
    },
    request_from: 9,
    origin_from: BRAND_KEY
  };
  const res = await axios.post('https://app-v1.live3d.io/aitools/of/create', payload, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
      ...cryptoHeaders
    },
    timeout: 30000
  });

  if (!res.data?.data?.task_id) {
    throw new Error('Gagal membuat task_id di Live3D');
  }

  return res.data.data.task_id;
}

async function cekjob(taskId, fp) {
  const cryptoHeaders = gencryptoheaders('check', fp);
  const payload = {
    task_id: taskId,
    fn_name: FN_NAME,
    call_type: 3,
    request_from: 9,
    origin_from: BRAND_KEY
  };
  const res = await axios.post('https://app-v1.live3d.io/aitools/of/check-status', payload, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      'theme-version': '83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q',
      ...cryptoHeaders
    },
    timeout: 15000
  });
  return res.data.data;
}

module.exports = [
  {
    name: "Upscale Image",
    desc: "Meningkatkan kualitas/resolusi gambar menjadi HD",
    category: "Tools",
    parameters: {
      apikey: { type: "string" },
      url: { type: "string" }
    },
    path: "/api/tools/hd",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      let url = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Url gambar wajib diisi" });
      }

      try {
        let cleanUrl = decodeURIComponent(url).trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl.replace(/^https?:\/*/, '');
        }

        const scaleFactor = 4;
        const uploadInfo = await upimageFromUrl(cleanUrl);
        const taskId = await createJob(uploadInfo.path, scaleFactor, uploadInfo.fp);

        let resultData;
        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          resultData = await cekjob(taskId, uploadInfo.fp);

          if (resultData && resultData.status === 2) break;
          if (resultData && resultData.status === 3) throw new Error("Proses upscale gagal dari server Live3D");
          attempts++;
        }

        if (!resultData || resultData.status !== 2) {
          throw new Error("Proses upscale terlalu lama (Timeout)");
        }

        res.json({
          status: true,
          result: {
            task_id: taskId,
            scale: `${scaleFactor}x`,
            url: 'https://temp.live3d.io/' + resultData.result_image
          }
        });

      } catch (err) {
        res.status(500).json({
          status: false,
          error: err.message || 'Terjadi kesalahan pada server'
        });
      }
    }
  }
];
