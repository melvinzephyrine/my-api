const BASE = "https://p.savenow.to";
const DEFAULT_APIKEY = "dfcb6d76f2f6a9894gjkege8a4ab232222";
const REFERER = "https://en.loader.to/";
const FORMATS = ["mp3", "m4a", "webm", "aac", "flac", "opus", "ogg", "wav", "144", "240", "360", "480", "720", "1080", "1440", "4k"];

const baseHeaders = {
  "accept": "*/*",
  "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "Referer": REFERER
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function health() {
  try {
    await fetch(`${BASE}/api/health`, { method: "HEAD", headers: baseHeaders });
  } catch (_) {}
}

async function requestDownload(sourceUrl, format, apikey, addInfo) {
  const params = new URLSearchParams({ format, url: sourceUrl, apikey });
  if (addInfo) params.set("add_info", "1");
  const res = await fetch(`${BASE}/api/v2/download?${params.toString()}`, { headers: baseHeaders });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Permintaan download ditolak oleh server target");
  return data;
}

async function checkProgress(id) {
  const res = await fetch(`${BASE}/api/progress?id=${encodeURIComponent(id)}&_=${Date.now()}`, { headers: baseHeaders });
  return res.json();
}

function isFailureStatus(progress) {
  if (progress.error) return true;
  const text = (progress.text || "").toLowerCase();
  return text.includes("fail") || text.includes("error") || text.includes("gagal");
}

async function waitForResult(id, options = {}) {
  const intervalMs = options.intervalMs || 1500;
  const maxAttempts = options.maxAttempts || 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const progress = await checkProgress(id);
    if (progress.download_url) return progress;
    if (isFailureStatus(progress)) throw new Error(progress.text || progress.error || "Proses konversi gagal");
    await sleep(intervalMs);
  }
  throw new Error("Timeout menunggu hasil konversi video");
}

async function probe(url) {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { Referer: REFERER } });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || null,
      contentLength: res.headers.get("content-length") ? Number(res.headers.get("content-length")) : null
    };
  } catch (_) {
    return null;
  }
}

async function download(sourceUrl, format = "mp3", options = {}) {
  if (!sourceUrl) throw new Error("URL YouTube wajib diisi");
  if (!FORMATS.includes(format)) throw new Error(`Format tidak valid. Pilih salah satu: ${FORMATS.join(", ")}`);

  const apikey = options.apikey || DEFAULT_APIKEY;
  const addInfo = options.addInfo !== false;

  await health();

  const initial = await requestDownload(sourceUrl, format, apikey, addInfo);

  let final = initial;
  if (!initial.url && !initial.download_url) {
    final = await waitForResult(initial.id, options);
  }

  const downloadUrl = final.download_url || final.url || initial.url;
  const fileInfo = options.probe === false ? null : await probe(downloadUrl);

  return {
    status: true,
    result: {
      source_url: sourceUrl,
      format: format,
      id: initial.id,
      title: initial.info ? initial.info.title || "YouTube Content" : "YouTube Content",
      thumbnail: initial.info ? initial.info.image || null : null,
      download_url: downloadUrl,
      filename: final.filename || null,
      file_info: fileInfo
    }
  };
}

module.exports = [
  {
    name: "YouTube Downloader",
    desc: "Unduh audio/video YouTube dengan pilihan berbagai format (MP3, MP4, 360p - 4K)",
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
        example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 
      },
      format: {
        type: "select",
        required: false,
        selection: FORMATS,
        value: "mp3"
      }
    },
    path: "/api/download/ytdl",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;
      const format = req.query.format || req.body?.format || "mp3";

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url YouTube wajib diisi" });
      }

      try {
        const downloadData = await download(targetUrl, format);
        return res.json(downloadData);
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Gagal mengunduh konten YouTube"
        });
      }
    }
  }
];