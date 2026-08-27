const axios = require('axios');
const crypto = require('crypto');

const BASE_ANON = 'https://android.chat.openai.com/backend-anon';
const UA = 'ChatGPT/1.2026.181 (Android 16; Neo/1.0; build 2222222)';

const COMMON_HEADERS = {
  'User-Agent': UA,
  'OAI-Package-Name': 'com.openai.chatgpt',
  'OAI-Client-Type': 'android',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'X-Device-Tier': 'upper_mid',
  'ChatGPT-Account-Id': 'default',
  'ChatGPT-Residency-Region': 'no_constraint',
};

const conversationSessions = new Map();

function parseCookieHeader(rawCookies) {
  if (!rawCookies) return {};
  return rawCookies.reduce((acc, c) => {
    const [k, v] = c.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
}

function cookieString(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
}

function stripSpecialTags(text) {
  if (!text) return '';
  text = text.replace(/\ue200entity\ue202([^\ue201]+)\ue201/g, (_, p1) => {
    try {
      const arr = JSON.parse(p1);
      return arr[1] ?? arr[0] ?? '';
    } catch { return ''; }
  });
  return text.replace(/\ue200[^\ue201]*\ue201/g, '').trim();
}

async function getAuth() {
  const deviceId = crypto.randomUUID();

  const res = await axios.post(
    `${BASE_ANON}/sentinel/chat-requirements`,
    {},
    {
      headers: {
        ...COMMON_HEADERS,
        'OAI-Device-Id': deviceId,
        'X-OpenAI-Target-Path': '/backend-anon/sentinel/chat-requirements',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 15000
    }
  );

  const cookies = parseCookieHeader(res.headers['set-cookie']);
  let oaiSc = cookies['oai-sc'];
  if (!oaiSc && res.data?.token) oaiSc = `0${res.data.token}`;

  const cookieHeader = oaiSc
    ? `oai-sc=${oaiSc}; ${cookieString(cookies)}`
    : cookieString(cookies);

  return {
    cookie: cookieHeader,
    deviceId
  };
}

async function processChatGPT(userPrompt, inputChatId = null) {
  const sessionKey = inputChatId || crypto.randomUUID();
  
  let history = conversationSessions.get(sessionKey) || [];

  let fullPrompt = userPrompt;
  if (history.length > 0) {
    const formattedHistory = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n');
    fullPrompt = `Berikut adalah riwayat percakapan kita sebelumnya:\n${formattedHistory}\n\nUser: ${userPrompt}\nAssistant:`;
  }

  const auth = await getAuth();
  const currentMessageId = crypto.randomUUID();

  const headers = {
    ...COMMON_HEADERS,
    'OAI-Device-Id': auth.deviceId,
    'X-OpenAI-Target-Path': '/backend-anon/f/conversation',
    'ChatGPT-Account-Id': 'default',
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Cookie': auth.cookie,
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
  };

  const body = {
    action: 'next',
    messages: [{
      id: currentMessageId,
      author: { role: 'user' },
      content: { content_type: 'text', parts: [fullPrompt] },
      status: 'finished_successfully',
      recipient: 'all',
    }],
    model: 'auto',
    history_and_training_disabled: false,
    fork_from_shared_post: false,
    enable_message_followups: true,
    force_use_sse: true,
    force_use_search: null,
    force_paragen: false,
    supported_encodings: ['v1'],
    supports_buffering: true,
    timezone: 'Asia/Makassar',
    timezone_offset_min: -480,
    system_hints: [],
    is_onboarding_conversation: false,
    no_auth_ad_preferences: { personalization_enabled: true, history_enabled: true },
    client_prepare_state: 'none',
    stream: true,
  };

  const response = await axios.post(`${BASE_ANON}/f/conversation`, body, {
    headers,
    responseType: 'stream',
    timeout: 35000
  });

  return new Promise((resolve, reject) => {
    let text = '';
    let buf = '';
    let lastPath = null;
    let lastOp = null;
    let assistantMsgId = null;

    response.data.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        let data;
        try { data = JSON.parse(trimmed.slice(6)); } catch { continue; }

        if (data.p !== undefined) lastPath = data.p;
        if (data.o !== undefined) lastOp = data.o;

        if (lastOp === 'add' && data.v?.message?.author?.role === 'assistant') {
          assistantMsgId = data.v.message.id;
          const parts = data.v.message.content?.parts;
          if (parts?.[0]) text = parts[0];

        } else if (lastOp === 'patch' && Array.isArray(data.v)) {
          for (const op of data.v) {
            if (op.o === 'append' && op.p?.startsWith('/message/content/parts/'))
              text += op.v ?? '';
          }

        } else if (
          lastOp === 'append' &&
          lastPath?.startsWith('/message/content/parts/') &&
          typeof data.v === 'string'
        ) {
          text += data.v;
        }
      }
    });

    response.data.on('end', () => {
      const cleanResponse = stripSpecialTags(text);

      history.push({ role: 'user', text: userPrompt });
      history.push({ role: 'assistant', text: cleanResponse });

      if (history.length > 10) history = history.slice(-10);
      conversationSessions.set(sessionKey, history);

      resolve({
        response: cleanResponse,
        chatId: sessionKey,
        messageId: assistantMsgId || crypto.randomUUID()
      });
    });

    response.data.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = [
  {
    name: "ChatGPT",
    desc: "Asisten AI cerdas berbasis model ChatGPT",
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
    path: "/api/ai/chatgpt",
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
        const result = await processChatGPT(prompt, chatId);
        return res.json({
          status: true,
          result: {
            prompt: prompt,
            response: result.response,
            chatId: result.chatId,
            messageId: result.messageId
          }
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Gagal mendapatkan respon dari ChatGPT"
        });
      }
    }
  }
];
