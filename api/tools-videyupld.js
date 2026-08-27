const https = require("https");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

function generateVisitorId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
}

function getVideoExtension(videoId) {
  if (!videoId) return "mp4";
  if (videoId.length === 8 || (videoId.length === 9 && videoId.endsWith("1"))) return "mp4";
  if (videoId.length === 9 && videoId.endsWith("2")) return "mov";
  return "mp4";
}

function buildMultipartBody(filePath, boundary) {
  const fileName = path.basename(filePath);
  const fileData = fs.readFileSync(filePath);
  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
  parts.push(Buffer.from("Content-Type: video/mp4\r\n\r\n"));
  parts.push(fileData);
  parts.push(Buffer.from("\r\n"));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

async function videyUpload(filePath, apiKey, apiSecret) {
  const visitorId = generateVisitorId();
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const body = buildMultipartBody(filePath, boundary);
  const uploadHeaders = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": body.length,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://videy.co",
    "Referer": "https://videy.co/"
  };
  if (apiKey) uploadHeaders["X-API-KEY"] = apiKey;
  if (apiSecret) uploadHeaders["X-API-SECRET"] = apiSecret;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "videy.co",
      path: `/api/upload?visitorId=${visitorId}`,
      method: "POST",
      headers: uploadHeaders
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.id) {
            resolve({
              status: true,
              result: {
                id: json.id,
                link: json.link,
                cdn_url: `https://cdn.videy.co/${json.id}.${getVideoExtension(json.id)}`
              }
            });
          } else {
            resolve({ status: false, error: json.error || `Upload gagal dengan status HTTP ${res.statusCode}` });
          }
        } catch {
          resolve({ status: false, error: "Response tidak valid dari server Videy" });
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = [
  {
    name: "Videy Uploader",
    desc: "Unggah file video MP4/MOV langsung ke Videy.co",
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
    path: "/api/tools/videy-upload",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const uploadedFile = req.files && req.files.length > 0 ? req.files[0] : null;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!uploadedFile || !uploadedFile.path) {
        return res.json({ status: false, error: "Wajib mengunggah file video (form-data: file)" });
      }

      const tempPath = uploadedFile.path;

      try {
        const uploadResult = await videyUpload(tempPath);

        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }

        return res.json(uploadResult);

      } catch (err) {
        if (tempPath && fs.existsSync(tempPath)) {
          try { await fsp.unlink(tempPath); } catch (e) {}
        }
        return res.json({
          status: false,
          error: err.message || "Gagal mengunggah video ke Videy"
        });
      }
    }
  }
];
