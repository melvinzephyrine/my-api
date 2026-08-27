const axios = require('axios');
const crypto = require('crypto');

function _0x3a24() {
  let e = [
    "error", "6C35BBC4EB", "32065fiPRVJ", "9651PJDqag", "match",
    "2949160OwuPPs", "1QaLwoE", "subtle", "15775023ibpdbH", "or:",
    "gMUfw", "12IfiARR", "importKey", "3235491JMTwmH", "334826TTrbVe",
    "10zgbCLj", "Format err", "2719575PhDuLf", "592dZwFMH", "7584E4A29F",
    "Invalid fo", "on failed:", "YrlUc", "crypto", "AES-CBC", "map"
  ];
  return (_0x3a24 = function () { return e; })();
}

function _0x5ec9(e, t) {
  let a = _0x3a24();
  return (_0x5ec9 = function (e, t) { return a[e -= 450]; })(e, t);
}

!(function (e, t) {
  let a = _0x5ec9, s = e();
  for (; ;) try {
    let e = -parseInt(a(469)) / 1 * (parseInt(a(451)) / 2) +
      -parseInt(a(466)) / 3 * (parseInt(a(455)) / 4) +
      -parseInt(a(465)) / 5 * (parseInt(a(474)) / 6) +
      -parseInt(a(450)) / 7 +
      -parseInt(a(468)) / 8 +
      parseInt(a(454)) / 9 +
      -parseInt(a(452)) / 10 * (-parseInt(a(471)) / 11);
    if (249055 === e) break;
    s.push(s.shift());
  } catch (e) {
    s.push(s.shift());
  }
})(_0x3a24, 0);

function getSecretKeyHex() {
  const u = _0x5ec9;
  return "C5D58EF67A" + u(456) + u(464) + "12";
}

function decryptData(encryptedBase64) {
  const keyHex = getSecretKeyHex();
  const key = Buffer.from(keyHex, 'hex');

  const encryptedBuffer = Buffer.from(encryptedBase64.replace(/\s/g, ''), 'base64');
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);

  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(ciphertext, null, 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

const headers = {
  'host': 'cdn403.savetube.vip',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  'origin': 'https://y2mate.net.co',
  'referer': 'https://y2mate.net.co/',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site'
};

async function getInfo(youtubeUrl) {
  const response = await axios.post('https://cdn403.savetube.vip/v2/info', {
    url: youtubeUrl
  }, { headers });

  return response.data;
}

async function getDownload(downloadType, quality, key) {
  const response = await axios.post('https://cdn403.savetube.vip/download', {
    downloadType,
    quality,
    key
  }, {
    headers: {
      ...headers,
      'accept': '*/*',
      'priority': 'u=4'
    }
  });

  return response.data;
}

async function processMedia(youtubeUrl, downloadType = 'audio', quality = '128') {
  try {
    const infoRes = await getInfo(youtubeUrl);

    if (!infoRes?.data) {
      return {
        status: false,
        error: 'Gagal mendapatkan data respon dari server YouTube'
      };
    }

    const decryptedMetaData = decryptData(infoRes.data);
    const extractedKey = decryptedMetaData?.key;

    if (!extractedKey) {
      return {
        status: false,
        error: 'Gagal mengekstrak kunci media'
      };
    }

    const downloadRes = await getDownload(downloadType, quality, extractedKey);

    if (!downloadRes?.data?.downloadUrl) {
      return {
        status: false,
        error: 'Gagal mendapatkan URL unduhan MP3'
      };
    }

    return {
      status: true,
      result: {
        title: decryptedMetaData.title,
        duration: decryptedMetaData.durationLabel,
        quality: `${quality}kbps`,
        downloadUrl: downloadRes.data.downloadUrl,
        downloaded: downloadRes.data.downloaded
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message || 'Terjadi kesalahan sistem'
    };
  }
}

module.exports = [
  {
    name: "YouTube MP3 Downloader",
    desc: "Download lagu/audio YouTube ke format MP3 dengan pilihan kualitas bitrate (kbps)",
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
        example: "https://youtu.be/W5_JxKjetVg" 
      },
      kbps: { 
        type: "select", 
        required: true, 
        selection: ["128", "320", "256", "64"],
        value: "128"
      }
    },
    path: "/api/download/ytmp3",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const url = req.query.url || req.body?.url;
      const kbps = req.query.kbps || req.body?.kbps || "128";

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Parameter url wajib diisi" });
      }

      const validQuality = ["320", "256", "128", "64"].includes(kbps) ? kbps : "128";
      const result = await processMedia(url, 'audio', validQuality);
      
      return res.json(result);
    }
  }
];
