const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const cheerio = require('cheerio');
const os = require('os');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const genHex = (bytes) => {
  try {
    return crypto.randomBytes(bytes).toString('hex');
  } catch {
    return Math.random().toString(36).substring(2, 2 + bytes * 2) + Date.now().toString(36);
  }
};

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "fp": "736a40aa4f1955107de07e754dd90a83",
  "fp1": "+7DgyHTn35SMUvUEJrBzpoN6iaxV5NNq4Nl2athfyJpprPzHxCGH9A04O/oHnFul",
  "x-guide": "GgnEiQoxF1/aBuSiJ70hQcXilAXI9507s4p9NwyLsJq27TDUQdbReZuzkjh6Rc2fO+sT4tlY7i+X26FceZhgplhyA5xCPd7CYAUQWu+24FGbYkwcy/EnVz2Ln2wXyhlb8QzpYMNOZNhP+iv15O1RE8fMvxniG4V8f48mlsaHU2o=",
  "theme-version": "83EmcUoQTUv50LhNx0VrdcK8rcGexcP35FcZDcpgWsAXEyO4xqL5shCY6sFIWB2Q",
  "X-code": "1781249888197",
  "Brand-Key": "8f3f0c7387123ae0",
  "Origin": "https://live3d.io",
  "Referer": "https://live3d.io/"
};

const STATIC_ORIGIN_FROM = genHex(8);

async function uploadtop4top(filePath, filename = 'image.jpg') {
  const form = new FormData();
  form.append('file_1_', fs.createReadStream(filePath), filename);
  form.append('submitr', '[ رفع الملفات ]');

  const res = await axios.post('https://top4top.io/index.php', form, {
    headers: {
      ...form.getHeaders(),
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0'
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  const $ = cheerio.load(res.data);
  const url = $('div.alert.alert-warning ul li span a').attr('href');

  if (!url) throw new Error('Gagal mengunggah foto ke server penyimpan sementara');
  return url;
}

const deepNudeAPI = {
  upload: async (imageUrl) => {
    try {
      const tmpFile = path.join(os.tmpdir(), `dn_upload_${Date.now()}.jpg`);
      const res = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 30000,
        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
      });

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpFile);
        res.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const form = new FormData();
      form.append('file', fs.createReadStream(tmpFile), { filename: 'img.jpg', contentType: 'image/jpeg' });
      form.append('fn_name', 'cloth-change');
      form.append('request_from', '9');
      form.append('origin_from', STATIC_ORIGIN_FROM);

      const response = await axios.post('https://app-v1.live3d.io/aitools/upload-img', form, {
        headers: { ...DEFAULT_HEADERS, ...form.getHeaders() },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000
      });

      try { await fsp.unlink(tmpFile); } catch {}
      return response.data?.code === 200 ? response.data.data?.path : null;
    } catch (e) {
      return null;
    }
  },

  createTask: async (imagePath) => {
    try {
      const payload = {
        fn_name: "cloth-change",
        call_type: 3,
        input: {
          source_image: imagePath,
          prompt: "best quality, naked, nude. Maintain the pose, if the breasts are small then enlarge them, otherwise if they are already large then leave them! Don't make breasts smaller!!!!",
          cloth_type: "full_outfits",
          request_from: 9,
          type: 1
        },
        request_from: 9,
        origin_from: STATIC_ORIGIN_FROM
      };
      const response = await axios.post('https://app-v1.live3d.io/aitools/of/create', payload, {
        headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/json' },
        timeout: 30000
      });
      return response.data?.code === 200 ? response.data.data?.task_id : null;
    } catch (e) {
      return null;
    }
  },

  checkStatus: async (taskId) => {
    try {
      const payload = {
        task_id: taskId,
        fn_name: "cloth-change",
        call_type: 3,
        consume_type: 0,
        request_from: 9,
        origin_from: STATIC_ORIGIN_FROM
      };
      const response = await axios.post('https://app-v1.live3d.io/aitools/of/check-status', payload, {
        headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/json' },
        timeout: 30000
      });

      if (response.data?.code === 200 && response.data.data?.status === 2) {
        return {
          status: 'success',
          url: 'https://temp.live3d.io/' + response.data.data.result_image
        };
      }
      return { status: 'pending' };
    } catch (e) {
      return { status: 'pending' };
    }
  },

  process: async (imageUrl) => {
    const path = await deepNudeAPI.upload(imageUrl);
    if (!path) throw new Error('Gagal mengunggah foto ke server AI');
    
    const taskId = await deepNudeAPI.createTask(path);
    if (!taskId) throw new Error('Gagal membuat antrean tugas AI');

    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const res = await deepNudeAPI.checkStatus(taskId);
      if (res.status === 'success') return { success: true, url: res.url };
    }
    throw new Error('Timeout: Pemrosesan AI terlalu lama');
  }
};

module.exports = [
  {
    name: "Remove Clothes",
    desc: "Ubah/lepas pakaian dari foto gambar menggunakan AI",
    category: "Premium",
    method: "POST",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      image: { 
        type: "file", 
        required: true 
      }
    },
    path: "/api/prem/tonaked",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey || req.headers['x-apikey'];
      let targetImageUrl = req.query.url || req.body?.url;
      
      const uploadedFile = req.files && req.files.length > 0 ? req.files[0] : null;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!uploadedFile && !targetImageUrl) {
        return res.json({ status: false, error: "Wajib unggah file gambar" });
      }

      let localFilePath = null;

      try {
        if (uploadedFile) {
          localFilePath = uploadedFile.path;
          targetImageUrl = await uploadtop4top(localFilePath, uploadedFile.originalname || 'image.jpg');
        }

        const processResult = await deepNudeAPI.process(targetImageUrl);

        if (localFilePath && fs.existsSync(localFilePath)) {
          try { await fsp.unlink(localFilePath); } catch (e) {}
        }

        return res.json({
          status: true,
          result: {
            input_url: targetImageUrl,
            result_url: processResult.url
          }
        });

      } catch (err) {
        if (localFilePath && fs.existsSync(localFilePath)) {
          try { await fsp.unlink(localFilePath); } catch (e) {}
        }
        return res.json({
          status: false,
          error: err.message || "Gagal memproses gambar"
        });
      }
    }
  }
];
