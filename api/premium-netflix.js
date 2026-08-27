const net = require('net');
const tls = require('tls');
const zlib = require('zlib');
const crypto = require('crypto');
const { URL } = require('url');

const SITE = 'http://nftools.aroshi.my.id';
const TARGET_HOST = new URL(SITE).hostname;
const TARGET_PORT = Number(new URL(SITE).port || 80);

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
];

const PLANS = ['premium', 'standard', 'basic'];

const PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=2000&count=100',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
];

function pickUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

function browserHeaders(extra = {}) {
  return Object.assign({
    'User-Agent': pickUA(),
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': SITE,
    'Referer': SITE + '/nftoken',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  }, extra);
}

class HttpError extends Error {
  constructor(status, data) {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    super(`HTTP ${status}: ${String(s).slice(0, 150)}`);
    this.status = status; 
    this.data = data;
  }
}

class RotateError extends Error {}

function parseProxyLine(line) {
  line = line.trim();
  if (!line) return null;
  if (line.startsWith('http://') || line.startsWith('https://')) {
    try {
      const u = new URL(line);
      const p = { host: u.hostname, port: Number(u.port || 80), https: u.protocol === 'https:' };
      if (u.username) p.auth = Buffer.from(`${u.username}:${u.password}`).toString('base64');
      return p;
    } catch (e) { return null; }
  }
  const m = line.match(/^([^:]+):(\d+)(?::([^:]+):([^:]+))?$/);
  if (!m) return null;
  const p = { host: m[1], port: Number(m[2]) };
  if (m[3]) p.auth = Buffer.from(`${m[3]}:${m[4]}`).toString('base64');
  return p;
}

async function fetchProxyLines() {
  let lines = [];
  for (const src of PROXY_SOURCES) {
    try {
      const r = await fetch(src, { signal: AbortSignal.timeout(4000) });
      lines.push(...(await r.text()).split(/\r?\n/));
    } catch (e) {}
  }
  return lines;
}

class ProxyPool {
  constructor(list) {
    this.list = list; 
    this.idx = 0;
    this.valid = []; 
    this.validIdx = 0;
    this.fails = new Map();
  }

  static async load() {
    let lines = await fetchProxyLines();
    const seen = new Set();
    const list = [];
    for (const l of lines) {
      const p = parseProxyLine(l);
      if (p && !seen.has(p.host + ':' + p.port)) { 
        seen.add(p.host + ':' + p.port); 
        list.push(p); 
      }
    }
    if (!list.length) throw new Error('Gagal scrape proxy publik');
    return new ProxyPool(list);
  }

  nextRaw() {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[this.idx % this.list.length];
      this.idx++;
      if (!this.dead(p)) return p;
    }
    return null;
  }

  nextValid() {
    for (let i = 0; i < this.valid.length; i++) {
      const v = this.valid[this.validIdx % this.valid.length];
      this.validIdx++;
      if (v.used) continue;
      return v;
    }
    return null;
  }

  dead(p) { 
    const k = p.host + ':' + p.port; 
    return (this.fails.get(k) || 0) >= 2; 
  }

  fail(p) {
    const k = p.host + ':' + p.port;
    this.fails.set(k, (this.fails.get(k) || 0) + 1);
  }

  reuse(p) { 
    const k = p.host + ':' + p.port; 
    this.fails.set(k, 0); 
  }

  addValid(p, session) { 
    this.valid.push({ proxy: p, session, used: false }); 
  }

  aliveValid() { 
    return this.valid.filter(v => !v.used).length; 
  }
}

function tunnel(proxy, host, port, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    let sock;
    if (proxy.https) {
      sock = tls.connect({ host: proxy.host, port: proxy.port, servername: proxy.host, rejectUnauthorized: false });
    } else {
      sock = net.connect({ host: proxy.host, port: proxy.port });
    }
    const timer = setTimeout(() => { sock.destroy(); reject(new RotateError('tunnel timeout')); }, timeoutMs);
    let buf = '';
    let settled = false;
    const fail = (e) => { if (settled) return; settled = true; clearTimeout(timer); sock.destroy(); reject(e); };
    const onData = d => {
      buf += d.toString('latin1');
      const i = buf.indexOf('\r\n\r\n');
      if (i === -1) { if (buf.length > 8192) fail(new RotateError('tunnel bad response')); return; }
      const status = parseInt(buf.split('\r\n')[0].split(' ')[1], 10);
      if (status === 200) {
        if (settled) return; 
        settled = true;
        clearTimeout(timer);
        sock.removeAllListeners('data');
        resolve(sock);
      } else {
        fail(new RotateError(`CONNECT ${status}`));
      }
    };
    sock.on('data', onData);
    sock.on('error', e => fail(new RotateError(`proxy: ${e.code || e.message}`)));
    const reqLine = `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n`;
    const auth = proxy.auth ? `Proxy-Authorization: Basic ${proxy.auth}\r\n` : '';
    sock.write(reqLine + auth + '\r\n');
  });
}

function inflate(buf, enc) {
  return new Promise((resolve, reject) => {
    if (!enc) return resolve(buf);
    if (enc === 'gzip') return zlib.gunzip(buf, (e, d) => e ? reject(e) : resolve(d));
    if (enc === 'deflate') return zlib.inflate(buf, (e, d) => e ? reject(e) : resolve(d));
    if (enc === 'br') return zlib.brotliDecompress(buf, (e, d) => e ? reject(e) : resolve(d));
    resolve(buf);
  });
}

async function request({ proxy, method, path, body, headers = {}, sessionToken, powProof, timeoutMs = 8000 }) {
  const h = browserHeaders();
  Object.assign(h, headers);
  if (sessionToken) h['X-NFToken-Session'] = sessionToken;
  if (powProof) h['X-PoW-Proof'] = powProof;
  h['Connection'] = 'close';
  h['Host'] = TARGET_HOST + ':' + TARGET_PORT;
  const payload = body !== undefined ? Buffer.from(JSON.stringify(body)) : null;
  if (payload) h['Content-Length'] = payload.length;

  const sock = await tunnel(proxy, TARGET_HOST, TARGET_PORT);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { sock.destroy(); reject(new RotateError('request timeout')); }, timeoutMs);
    let buf = Buffer.alloc(0);
    let headDone = false, status = 0, outHeaders = {}, chunked = false, remain = 0;
    let finished = false;
    const fail = e => { if (finished) return; finished = true; clearTimeout(timer); sock.destroy(); reject(e); };
    const collect = d => {
      buf = Buffer.concat([buf, d]);
      if (!headDone) {
        const i = buf.indexOf('\r\n\r\n');
        if (i === -1) { if (buf.length > 65536) fail(new Error('header too big')); return; }
        headDone = true;
        const headText = buf.slice(0, i).toString('latin1');
        const lines = headText.split('\r\n');
        status = parseInt(lines[0].split(' ')[1], 10);
        for (const l of lines.slice(1)) {
          const c = l.indexOf(':');
          if (c > 0) outHeaders[l.slice(0, c).trim().toLowerCase()] = l.slice(c + 1).trim();
        }
        chunked = outHeaders['transfer-encoding'] === 'chunked';
        remain = parseInt(outHeaders['content-length'] || '0', 10);
        buf = buf.slice(i + 4);
      }
      if (headDone && !chunked && buf.length >= remain) { sock.destroy(); clearTimeout(timer); finish(); }
    };
    const finish = async () => {
      if (finished) return; 
      finished = true;
      try {
        let data = chunked ? dechunk(buf) : buf.slice(0, remain);
        data = await inflate(data, outHeaders['content-encoding']);
        const text = data.toString('utf8');
        let parsed = text;
        try { parsed = JSON.parse(text); } catch (e) {}
        if (status >= 400) reject(new HttpError(status, parsed));
        else resolve(parsed);
      } catch (e) { reject(e); }
    };
    sock.on('data', collect);
    sock.on('error', fail);
    sock.on('close', () => {
      if (finished) return;
      if (headDone && (chunked || buf.length >= remain)) finish();
      else fail(new RotateError('conn closed'));
    });
    let reqLine = `${method} ${path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(h)) reqLine += `${k}: ${v}\r\n`;
    sock.write(Buffer.from(reqLine + '\r\n', 'latin1'));
    if (payload) sock.write(payload);
  });
}

function dechunk(buf) {
  const out = []; let i = 0;
  while (i < buf.length) {
    const j = buf.indexOf('\r\n', i);
    if (j === -1) break;
    const size = parseInt(buf.slice(i, j).toString(), 16);
    if (!size) break;
    out.push(buf.slice(j + 2, j + 2 + size));
    i = j + 2 + size + 2;
  }
  return Buffer.concat(out);
}

async function newSession(proxy) {
  const d = await request({ proxy, method: 'POST', path: '/api/session', body: {} });
  if (!d.success || !d.token) throw new HttpError(403, d);
  return d;
}

function solvePow(challenge, prefix = '0000') {
  for (let n = 0; n < 1000000; n++) {
    if (crypto.createHash('sha256').update(challenge + n).digest('hex').startsWith(prefix)) {
      return `${challenge}:${n}`;
    }
  }
  return null;
}

async function genToken(proxy, sessionToken, plan) {
  try {
    return await request({ proxy, method: 'POST', path: '/api/random', body: { plan }, sessionToken });
  } catch (e) {
    if (e instanceof HttpError && e.status === 403 && e.data && e.data.powChallenge) {
      const proof = solvePow(e.data.powChallenge);
      if (!proof) throw new Error('PoW gagal diselesaikan');
      return await request({ proxy, method: 'POST', path: '/api/random', body: { plan }, sessionToken, powProof: proof });
    }
    throw e;
  }
}

async function scanPool(pool, want, concurrency = 30, deadlineMs = 5000) {
  const found = [];
  const start = Date.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() - start < deadlineMs) {
      const p = pool.nextRaw();
      if (!p || found.length >= want) return;
      try {
        await tunnel(p, TARGET_HOST, TARGET_PORT, 3000);
        const session = await newSession(p);
        pool.addValid(p, session);
        found.push(p);
      } catch (e) {
        if (!(e instanceof RotateError)) pool.fail(p);
      }
    }
  });
  await Promise.all(workers);
  return found;
}

module.exports = [
  {
    name: "Netflix Token Generator",
    desc: "Membangkitkan token premium Netflix dengan rotasi proxy otomatis",
    category: "Premium",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      plan: { 
        type: "select", 
        required: true, 
        selection: ["premium", "standard", "basic"],
        value: "premium"
      },
      count: { 
        type: "number", 
        required: false, 
        example: "1" 
      }
    },
    path: "/api/prem/netflix",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const plan = req.query.plan || req.body?.plan;
      const count = req.query.count || req.body?.count;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      const want = Math.min(parseInt(count, 10) || 1, 2);
      const targetPlan = (plan && PLANS.includes(plan)) ? plan : 'premium';
      const results = [];

      try {
        const pool = await ProxyPool.load();
        await scanPool(pool, want);

        if (pool.aliveValid() === 0) {
          return res.status(500).json({
            status: false,
            error: "Gagal mendapatkan proxy publik yang aktif. Silakan coba lagi."
          });
        }

        while (results.length < want) {
          const v = pool.nextValid();
          if (!v) break;

          try {
            const d = await genToken(v.proxy, v.session.token, targetPlan);

            if (d.success && d.url) {
              results.push({
                plan: targetPlan,
                url: d.url,
                expires: d.expires,
                quality: d.quality,
                country: d.country
              });
              pool.reuse(v.proxy);
            } else {
              pool.fail(v.proxy);
            }
          } catch (e) {
            pool.fail(v.proxy);
          }
          v.used = true;
        }

        if (results.length > 0) {
          return res.json({
            status: true,
            message: `Berhasil membangkitkan ${results.length} token`,
            result: results
          });
        } else {
          return res.json({
            status: false,
            error: "Gagal membangkitkan token (terkendala rate-limit server target)"
          });
        }

      } catch (err) {
        return res.status(500).json({
          status: false,
          error: err.message || "Terjadi kesalahan internal pada server"
        });
      }
    }
  }
];
