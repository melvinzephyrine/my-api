const https = require('https');
const crypto = require('crypto');

const agent = new https.Agent({ keepAlive: true });

const geminiSessions = new Map();

function cleanText(text) {
  if (!text) return '';
  text = text.replace(/https?:\/\/[a-z0-9.-]*googleusercontent\.com\/[^\s\n"<>]+/gi, '');
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function request(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers,
      agent,
      maxHeaderSize: 1048576
    };

    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ text: Buffer.concat(chunks).toString(), headers: res.headers }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseFrames(buffer) {
  const frames = [];
  let remaining = buffer;

  if (remaining.startsWith(")]}'")) remaining = remaining.substring(4).trimStart();

  while (true) {
    const nl = remaining.indexOf('\n');
    if (nl === -1) break;

    const sizeStr = remaining.substring(0, nl).trim();
    const size = parseInt(sizeStr, 10);

    if (isNaN(size)) {
      remaining = remaining.substring(nl + 1);
      continue;
    }

    if (remaining.length < nl + size) break;

    const framePayload = remaining.substring(nl, nl + size);
    remaining = remaining.substring(nl + size);

    try {
      const frameData = JSON.parse(framePayload);
      for (const item of (Array.isArray(frameData) ? frameData : [frameData])) {
        const innerStr = item?.[2];
        if (!innerStr) continue;
        try { frames.push(JSON.parse(innerStr)); } catch (_) {}
      }
    } catch (_) {}
  }

  return { frames, remaining };
}

async function startSession() {
  const pageRes = await request('https://gemini.google.com/app', {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const cfb2hMatch = pageRes.text.match(/"cfb2h":\s*"(.*?)"/);
  const buildLabel = cfb2hMatch ? cfb2hMatch[1] : 'boq_assistant-bard-web-server_20260709.09_p0';

  const atMatch = pageRes.text.match(/"SNlM0e":"([^"]+)"/);
  const sidMatch = pageRes.text.match(/"FdrFJe":"(-?\d+)"/);
  const atToken = atMatch ? atMatch[1] : null;
  const fSid = sidMatch ? sidMatch[1] : null;

  return {
    buildLabel,
    atToken,
    fSid,
    reqId: Math.floor(Math.random() * 90000) + 10000
  };
}

async function chatGemini(userPrompt, inputChatId = null) {
  const sessionKey = inputChatId || crypto.randomUUID();
  let history = geminiSessions.get(sessionKey) || [];

  let finalPrompt = userPrompt;
  if (history.length > 0) {
    const formattedHistory = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n');
    finalPrompt = `Berikut adalah riwayat percakapan kita sebelumnya:\n${formattedHistory}\n\nUser: ${userPrompt}\nAssistant:`;
  }

  const auth = await startSession();
  const traceId = crypto.randomUUID().toUpperCase();

  const queryParams = new URLSearchParams({ hl: 'en-US', _reqid: String(auth.reqId), rt: 'c' });
  if (auth.buildLabel) queryParams.set('bl', auth.buildLabel);
  if (auth.fSid) queryParams.set('f.sid', auth.fSid);

  const metadata = ['', '', '', null, null, null, null, null, null, ''];
  const payload = [
    [finalPrompt, 0, null, null, null, null, 0], ['en-US'],
    metadata, null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1,
    null, null, null, null, null,
    ['', '', '', null, null, null, null, null, 0, null, 1, null, null, null, []],
    null, null, 1, null, null, null, null, null, null, null,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    1, null, null, null, null, [1]
  ];

  const bodyParams = new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(payload)]) });
  if (auth.atToken) bodyParams.set('at', auth.atToken);

  const res = await request(`https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${queryParams}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-goog-ext-525001261-jspb': '[1,null,null,null,"fbb127bbb056c959",null,null,0,[4,6],null,null,1,null,null,1]',
      'x-goog-ext-525005358-jspb': `["${traceId}",1]`,
      'x-goog-ext-73010989-jspb': '[0]',
      'x-goog-ext-73010990-jspb': '[0,0,0]',
      'x-same-domain': '1',
      'origin': 'https://gemini.google.com',
      'referer': 'https://gemini.google.com/'
    },
    body: bodyParams.toString()
  });

  let accumulatedText = '';
  const { frames } = parseFrames(res.text);

  for (const pj of frames) {
    for (const cand of (pj?.[4] || [])) {
      const cleaned = cleanText(cand?.[1]?.[0] || '');
      if (cleaned) accumulatedText = cleaned;
    }
  }

  if (!accumulatedText) {
    throw new Error("Gagal mendapatkan balasan dari Gemini");
  }

  history.push({ role: 'user', text: userPrompt });
  history.push({ role: 'assistant', text: accumulatedText });

  if (history.length > 10) history = history.slice(-10);
  geminiSessions.set(sessionKey, history);

  return {
    reply: accumulatedText,
    chatId: sessionKey
  };
}

module.exports = [
  {
    name: "Gemini",
    desc: "Asisten AI cerdas berbasis Google Gemini",
    category: "AI",
    method: "GET",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      prompt: { 
        type: "string", 
        required: true, 
        example: "halo" 
      },
      chatId: { 
        type: "string", 
        required: false, 
        example: "" 
      }
    },
    path: "/api/ai/gemini",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const prompt = req.query.prompt || req.body?.prompt;
      const chatId = req.query.chatId || req.body?.chatId || null;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!prompt) {
        return res.json({ status: false, error: "Parameter prompt pertanyaan wajib diisi" });
      }

      try {
        const result = await chatGemini(prompt, chatId);
        return res.json({
          status: true,
          result: {
            prompt: prompt,
            response: result.reply,
            chatId: result.chatId
          }
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Gagal mendapatkan respon dari Gemini AI"
        });
      }
    }
  }
];