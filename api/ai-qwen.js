const axios = require('axios');
const crypto = require('crypto');

const qwenSessions = new Map();

async function qwenchat(userMessage, inputChatId = null) {
  if (!userMessage || !userMessage.trim()) {
    throw new Error('Pesan tidak boleh kosong.');
  }

  const sessionKey = inputChatId || crypto.randomUUID();
  let history = qwenSessions.get(sessionKey) || [];

  let promptText = userMessage;
  if (history.length > 0) {
    const formattedHistory = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n');
    promptText = `Berikut adalah riwayat percakapan kita sebelumnya:\n${formattedHistory}\n\nUser: ${userMessage}\nAssistant:`;
  }

  const timestamp = Date.now();
  const requestId = crypto.randomUUID();

  const bxUmidToken = 'T2gAbheReRRQHQREJVinIV71av3i7ot6pOw4-aGlkCMoJP_3Q-npd7CvjvEWL6LLwP8=';
  const bxUa = '234!tpheKyk/eePWWb2XiwXpDRnItRRzqIvLlMR3NmmmXTWhPcwRQE3qOwbHD2uTUNHEiUIq6aN9b2dmDLkokv5sdDt+bFa8jwLwLKSXEBPRnfwqqVADTUsgeLCVZ3oHQQVNhMhuVk+H9iHj81MmOpuQc4btZZodQQymhsWZn3TH9iJXPkE7A3s/ce47Z3oHQQ1beX2vZ3Td9iJTCvkZQpknc247nZodQCyNhsfAZ3wTdiyKCPsZQkkic247SZZ0QCyDlsfWepDTH1dTCPO+/ks/c24HjZodQCyDPMf5ef+TMAJHhXkZQks/cs5TZJWHQCVmhNn0Z3wH95HBcfAhQppvcs5Tn3oHOc+tpLXjZ3wk9iJThpheQkp/cs4TrVcyQCymJstkZ0wd9Ad7hpoZQksvGdV7jtQ4PFXB/fguay/e9Ad7hIZZQpPVJM5YZYwH7CIWhMk+pkUm9is7hpoOnf3vcs4TgPmdCtYm5xOcZ3wH9uyMipZfCn1uc8V6AZodQQbHisWsZZT398VoinoZQkfLCs4HflodEm6RhxWZnTQ79Ad7hfrhm9TJgDl9T1ycsUr+e8rpHTjCprGxWovR6rtBAENkt1NRPTwxiJvft8rGaSmEwN5XcVVuF7IHJ1VFA+mDaHubg0Pc4kS+NIcbzHDBrEIADjVVeHmsS3l768jOwKbtN8ZBFaHdAtVaZPer49gHXBjR48cga/itS0OL3ZgPH1ZxgYKpo+X8pAreGivW6/lntE2J03Ulq7o7hO4tqCiA1byhUzpoS3Xm4oyaFw9cP8LM5lcn6DojS+UfhKKbcLNYu1C4QP7BfPaZYGHiZJtL1wu18r039RogUPUxlmvn4pFjUkvfTLqmRP+Q1HJ2hn7LoS8PPota+aekcc91AsByobUXd3tdDYMqSBvVhXAsBq8hYf734z1Is2e0YEQgR2R00wZDdZ8gh9Ffm8RaYPwFpP9rbbphI7S4sKgleTA9zPPHVFJLAm4Tg10Qgz9mK4SLLYAtTBXHh+mbCwnboUQDEAfQkS34ZVvgb7uah7sFZScx2HCGJYgEVtCSch5Q+hl+icWUvEIZGSVxhTqBG/MLdLFABcv4wN1kjlweaRhqS0C8moGPt/wwVSPxC23ave0IukdwkIi2iTnvIa6h7JhwRQKpCoq3cw+feZduAQg3rm1UzfvXHkdRQVYHMFTYYaRiuhCOpCgBHjD9qoVtu112jNNFeiRKOU/qdZUT8/gkJ1sdDhvu0RNbLTZNsl+d9qK0ue4sVB/+0oTxoYPGg5bjkyEnJ4aB+oHJ4zCIAgOmjx0W9odNQotmpcNg3LYpa7uQh2O/edDSFzrdhJ7Q57EA+NMgVcAFDyYAOl2/Vmslf1PwcnaIWFKg/bu/kkU7Hhsb9+esvqDprCzYznjmL5bDd40Oliz6JtexpAfT5YBPF45v7zXfwf11Qe0EDCnLPFP7qnlZM7qSJykqY7QOWhgSXZtk33xN73nu3de6MbPy+AzxQ6YQuDJCq40vgEhHmR/qL7QanEhjPDB/RhBbhLYoBS85rhB/+iTnno1Q+cVxCaaBbKOZ1ROYw1YK0xBzRQH2Fvii0S5fubeeRN3yabh7gVmL+J3XlPuojSS/oGFehzW1BRvEfDon6s0Z+bmxpbe8FKUpHRYYwLl405EO6TB5VwvO5VBvSkujJ/03HoXg7zcQJG19AxNBj8gDmb+ImJd7f7Ld6Lb5fvAmrQpBjzjCQpAlSME/4rRNRJW6gLXEWq4Q';

  const payload = {
    chatId: "",
    models: ["qwen3.7-plus"],
    project_id: "",
    timestamp: timestamp,
    chat_type: "t2t",
    chat_mode: "guest"
  };

  const sessionResponse = await axios.post('https://chat.qwen.ai/api/v2/chats/new', payload, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      'Version': '0.2.87',
      'source': 'h5',
      'Timezone': new Date().toString(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://chat.qwen.ai',
      'Referer': 'https://chat.qwen.ai/',
      'bx-umidtoken': bxUmidToken,
      'bx-v': '2.5.37',
      'bx-ua': bxUa,
      'X-Request-Id': requestId
    },
    timeout: 15000
  });

  if (!sessionResponse.data?.success || !sessionResponse.data?.data?.id) {
    throw new Error('Gagal membuat sesi Qwen baru: ' + JSON.stringify(sessionResponse.data));
  }

  const qwenChatId = sessionResponse.data.data.id;

  const completionPayload = {
    stream: true,
    version: "2.1",
    incremental_output: true,
    chatId: qwenChatId,
    parentId: "",
    chat_id: qwenChatId,
    chat_mode: "guest",
    model: "qwen3.7-plus",
    parent_id: null,
    messages: [
      {
        id: null,
        fid: crypto.randomUUID(),
        parentId: null,
        childrenIds: [],
        role: "user",
        content: promptText,
        user_action: "chat",
        files: [],
        timestamp: Math.floor(timestamp / 1000),
        models: ["qwen3.7-plus"],
        model: "",
        chat_type: "t2t",
        feature_config: {
          thinking_enabled: true,
          output_schema: "phase",
          research_mode: "normal",
          auto_thinking: true,
          thinking_mode: "Auto",
          thinking_format: "summary",
          auto_search: true
        },
        extra: { meta: { subChatType: "t2t" } },
        sub_chat_type: "t2t",
        parent_id: null
      }
    ],
    timestamp: Math.floor(Date.now() / 1000)
  };

  const response = await axios.post(`https://chat.qwen.ai/api/v2/chat/completions?chat_id=${qwenChatId}`, completionPayload, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      'Version': '0.2.87',
      'source': 'h5',
      'Timezone': new Date().toString(),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://chat.qwen.ai',
      'Referer': 'https://chat.qwen.ai/',
      'bx-umidtoken': bxUmidToken,
      'bx-v': '2.5.37',
      'bx-ua': bxUa,
      'Accept': 'text/event-stream',
      'X-Request-Id': crypto.randomUUID()
    },
    responseType: 'stream',
    timeout: 30000
  });

  return new Promise((resolve, reject) => {
    let fullAnswer = '';
    let buffer = '';

    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('data: ')) {
          const jsonStr = trimmedLine.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const choices = parsed.choices;
            if (choices && choices.length > 0) {
              const delta = choices[0].delta;
              if (delta && delta.phase === 'answer' && delta.content) {
                fullAnswer += delta.content;
              }
            }
          } catch {}
        }
      }
    });

    response.data.on('end', () => {
      const cleanAnswer = fullAnswer.trim();

      history.push({ role: 'user', text: userMessage });
      history.push({ role: 'assistant', text: cleanAnswer });

      if (history.length > 10) history = history.slice(-10);
      qwenSessions.set(sessionKey, history);

      resolve({
        response: cleanAnswer,
        chatId: sessionKey
      });
    });

    response.data.on('error', (err) => {
      reject(new Error('Stream error: ' + err.message));
    });
  });
}

module.exports = [
  {
    name: "Qwen AI",
    desc: "Asisten AI cerdas berbasis model Qwen 3.7 Plus",
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
    path: "/api/ai/qwen",
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
        const result = await qwenchat(prompt, chatId);
        return res.json({
          status: true,
          result: {
            prompt: prompt,
            response: result.response,
            chatId: result.chatId
          }
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Gagal mendapatkan respon dari Qwen AI"
        });
      }
    }
  }
];
