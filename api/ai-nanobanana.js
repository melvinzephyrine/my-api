const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const FormData = require('form-data');
const path = require('path');

function genserial() {
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s;
}

const DEFAULT_HEADERS = {
  'origin': 'https://imgupscaler.ai',
  'referer': 'https://imgupscaler.ai/',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
};

async function upimage(filename) {
  const form = new FormData();
  form.append('file_name', filename);

  const res = await axios.post(
    'https://api-v2.imgupscaler.ai/api/common/upload/upload-image',
    form,
    {
      headers: {
        ...form.getHeaders(),
        ...DEFAULT_HEADERS
      },
      timeout: 20000
    }
  );

  if (!res.data || !res.data.result) {
    throw new Error("Gagal mendapatkan URL upload dari server target");
  }

  return res.data.result;
}

async function uploadtoOSS(putUrl, filePath) {
  const file = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = ext === '.png' ? 'image/png' : 'image/jpeg';

  const res = await axios.put(
    putUrl,
    file,
    {
      headers: {
        'Content-Type': type,
        'Content-Length': file.length,
        'User-Agent': DEFAULT_HEADERS['user-agent']
      },
      maxBodyLength: Infinity,
      timeout: 60000
    }
  );

  return res.status === 200;
}

async function signObject(objectName) {
  const form = new FormData();
  form.append('object_name', objectName);
  form.append(
    'params',
    JSON.stringify({
      'x-oss-process': 'image/resize,m_fill,w_128,h_128/quality,q_80/format,webp'
    })
  );

  const res = await axios.post(
    'https://api-v2.imgupscaler.ai/api/common/upload/sign-object',
    form,
    {
      headers: {
        ...form.getHeaders(),
        ...DEFAULT_HEADERS
      },
      timeout: 20000
    }
  );

  if (!res.data || !res.data.result || !res.data.result.url) {
    throw new Error("Gagal memverifikasi objek gambar yang diunggah");
  }

  return res.data.result.url;
}

async function createJob(imgurl, prompt, serial) {
  await axios.post(
    'https://api-v2.imgupscaler.ai/api/pai/common/free-credits-config',
    {},
    {
      headers: {
        ...DEFAULT_HEADERS,
        'product-serial': serial
      },
      timeout: 20000
    }
  ).catch(() => {});

  const form = new FormData();
  form.append('model_name', 'nano_banana');
  form.append('original_image_url', imgurl);
  form.append('prompt', prompt);
  form.append('ratio', 'match_input_image');
  form.append('output_format', 'jpg');

  const res = await axios.post(
    'https://api-v2.imgupscaler.ai/api/runtime/jobs/create-job',
    form,
    {
      headers: {
        ...form.getHeaders(),
        ...DEFAULT_HEADERS,
        'product-code': 'magiceraser',
        'product-serial': serial,
        'router-key': 'photo_editor_nano_banana_v1',
        'timezone': 'Asia/Jakarta'
      },
      timeout: 20000
    }
  );

  if (!res.data || !res.data.result || !res.data.result.job_id) {
    throw new Error("Gagal membuat antrean tugas AI");
  }

  return res.data.result.job_id;
}

async function cekjob(jobId, serial) {
  const res = await axios.get(
    `https://api-v2.imgupscaler.ai/api/runtime/jobs/get-job/${jobId}`,
    {
      headers: {
        ...DEFAULT_HEADERS,
        'product-serial': serial
      },
      timeout: 15000
    }
  );

  return res.data;
}

async function processNanoBanana(imagePath, originalName, prompt) {
  const ext = path.extname(originalName || 'image.jpg') || '.jpg';
  const filename = `img_${Date.now()}${ext}`;

  const uploadInfo = await upimage(filename);
  await uploadtoOSS(uploadInfo.url, imagePath);

  const signedUrl = await signObject(uploadInfo.object_name);
  const serial = genserial();

  const jobId = await createJob(signedUrl, prompt, serial);

  let result;
  let attempts = 0;
  const maxAttempts = 30;

  do {
    await new Promise(r => setTimeout(r, 3000));
    result = await cekjob(jobId, serial);
    attempts++;
  } while (result && result.code === 300006 && attempts < maxAttempts);

  if (!result || result.code !== 100000 || !result.result || !result.result.output_url) {
    throw new Error(result?.message || 'Proses AI gagal atau memakan waktu terlalu lama');
  }

  return {
    job_id: jobId,
    result_url: result.result.output_url
  };
}

module.exports = [
  {
    name: "Nano Banana",
    desc: "Edit foto menggunakan perintah teks (prompt) berbasis AI",
    category: "AI",
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
      },
      prompt: { 
        type: "string", 
        required: true, 
        example: "ubah warna kulitnya menjadi hitam" 
      }
    },
    path: "/api/ai/nanobanana",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const prompt = req.query.prompt || req.body?.prompt;
      
      const uploadedFile = req.files && req.files.length > 0 ? req.files[0] : null;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!uploadedFile || !uploadedFile.path) {
        return res.json({ status: false, error: "Wajib mengunggah file gambar (form-data: image)" });
      }

      if (!prompt) {
        return res.json({ status: false, error: "Parameter prompt wajib diisi" });
      }

      const tempPath = uploadedFile.path;

      try {
        const resultData = await processNanoBanana(tempPath, uploadedFile.originalname, prompt);

        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }

        return res.json({
          status: true,
          result: resultData
        });

      } catch (err) {
        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }
        return res.json({
          status: false,
          error: err.message || "Gagal memproses gambar"
        });
      }
    }
  }
];
