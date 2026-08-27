const https = require('https');
const http = require('http');
const { URL } = require('url');

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'referer': 'https://klickpin.com/en2'
};

const CSRF_URL = 'https://klickpin.com/get-csrf-token.php';
const FORM_URL = 'https://klickpin.com/en2/download';

const PIN_LONG_RE = /^https?:\/\/(?:[\w-]+\.)?pinterest\.(com|co\.uk|de|fr|it|es|nl|se|ch|co\.in|br|au|at|cl|jp|ru|ie|ca|mx|nz|pt|ph)\/.+/i;
const SHORT_PIN_RE = /^https?:\/\/(?:www\.)?pin\.it\/[A-Za-z0-9\-_]+/i;

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
        res.resume();
        return request(loc, options).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getCsrfToken() {
  try {
    const res = await request(`${CSRF_URL}?t=${Date.now()}`, {
      headers: { 'Accept': 'application/json', 'user-agent': HEADERS['user-agent'] }
    });
    if (res.status === 200) {
      const json = JSON.parse(res.body);
      if (json && json.csrf_token) return json.csrf_token;
    }
  } catch (e) {}
  return '';
}

function extractResult(html) {
  const downloads = [];

  const dlBtnRegex = /data-download-url="([^"]+)"[^>]*data-download-filename="([^"]+)"/gi;
  let m;
  while ((m = dlBtnRegex.exec(html)) !== null) {
    downloads.push({ url: m[1], filename: m[2] });
  }

  if (downloads.length === 0) {
    const videoSrcRegex = /data-src="(https?:\/\/[^"]*pinimg[^"]+)"/gi;
    while ((m = videoSrcRegex.exec(html)) !== null) {
      downloads.push({ url: m[1], filename: '' });
    }
  }

  if (downloads.length === 0) {
    const imgRegex = /<img[^>]+src="(https?:\/\/i\.pinimg\.com\/[^"]+)"[^>]*>/gi;
    while ((m = imgRegex.exec(html)) !== null) {
      downloads.push({ url: m[1], filename: '' });
    }
  }

  const directLinks = [];
  const directRegex = /<a[^>]+class="custom-button-style3"[^>]+href="(https?:\/\/[^"]*pinimg[^"]+)"[^>]*>/gi;
  while ((m = directRegex.exec(html)) !== null) {
    directLinks.push(m[1]);
  }

  let analytics = null;
  const analyticsMatch = html.match(/kpDownloadAnalyticsEvent\s*=\s*(\{[^}]+\})/);
  if (analyticsMatch) {
    try { analytics = JSON.parse(analyticsMatch[1]); } catch (e) {}
  }

  return { downloads, directLinks, analytics };
}

async function pinterestDownloader(inputUrl) {
  if (!PIN_LONG_RE.test(inputUrl) && !SHORT_PIN_RE.test(inputUrl)) {
    throw new Error('Invalid Pinterest URL');
  }

  const csrfToken = await getCsrfToken();
  const body = new URLSearchParams();
  body.append('url', inputUrl);
  if (csrfToken) body.append('csrf_token', csrfToken);

  const res = await request(FORM_URL, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(body.toString()),
    },
    body: body.toString(),
  });

  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = extractResult(res.body);

  const outputData = {
    source: inputUrl,
    media_type: result.analytics?.media_type || 'unknown',
    downloads: result.downloads.map(d => ({
      url: d.url,
      filename: d.filename || undefined
    })),
  };

  if (result.directLinks.length > 0) outputData.direct_links = result.directLinks;

  return outputData;
}

module.exports = [
  {
    name: "Pinterest Downloader",
    desc: "Download foto / video dari Pinterest",
    category: "Downloader",
    parameters: {
      apikey: { type: "string" },
      url: { type: "string" }
    },
    path: "/api/download/pinterest",
    async run(req, res) {
      const { apikey, url } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Url is required" });
      }

      try {
        const result = await pinterestDownloader(url);

        res.json({
          status: true,
          result
        });
      } catch (err) {
        res.status(500).json({
          status: false,
          error: err.message
        });
      }
    }
  }
];
