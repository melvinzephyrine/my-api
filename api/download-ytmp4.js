const BASE = "https://a.ymcdn.org/api/v1";

const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Referer": "https://id.ytmp3.mobi/",
  "Origin": "https://id.ytmp3.mobi",
  "Accept": "*/*",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

function extractVideoId(input) {
  const patterns = [
    /(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  throw new Error("URL atau Video ID YouTube tidak valid");
}

function extractCookie(res, existing = "") {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return existing;
  const newCookie = setCookie.split(";")[0];
  if (!existing) return newCookie;
  const key = newCookie.split("=")[0];
  const parts = existing.split("; ").filter(p => !p.startsWith(key + "="));
  parts.push(newCookie);
  return parts.join("; ");
}

async function downloadYtMp4(urlInput) {
  try {
    const videoId = extractVideoId(urlInput);
    const rand = () => Math.random();

    const initRes = await fetch(`${BASE}/init?p=y&23=1llum1n471&_=${rand()}`, { headers: BASE_HEADERS });
    const cookie = extractCookie(initRes);
    const initData = await initRes.json();

    if (initData.error !== 0) throw new Error("Gagal menginisialisasi sesi pengunduhan");

    const convertRes = await fetch(`${initData.convertURL}&v=${videoId}&f=mp4&_=${rand()}`, {
      headers: { ...BASE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const convertData = await convertRes.json();

    if (convertData.error !== 0) throw new Error("Gagal mengonversi video ke MP4");

    return {
      status: true,
      result: {
        title: convertData.title,
        format: 'mp4',
        videoId: videoId,
        downloadURL: convertData.downloadURL,
        hash: convertData.hash
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.message || "Gagal mengunduh video YouTube"
    };
  }
}

module.exports = [
  {
    name: "YouTube MP4 Downloader",
    desc: "Unduh video dari YouTube menjadi format file MP4",
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
      }
    },
    path: "/api/download/ytmp4",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url YouTube wajib diisi" });
      }

      const result = await downloadYtMp4(targetUrl);
      return res.json(result);
    }
  }
];
