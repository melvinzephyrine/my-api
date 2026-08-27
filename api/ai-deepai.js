const crypto = require("crypto");

const PAGE = "https://deepai.org/chat/ai-code";
const API = "https://api.deepai.org/hacking_is_a_serious_crime";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const AVAILABLE_MODELS = [
  "chat",
  "ai-code",
  "deepai-indexer",
  "cyberpunk-ai",
  "creative-writing-ai"
];

const sessions = new Map();

const myhash = (s) => crypto.createHash("md5").update(s).digest("hex");

function generateIslandKey() {
  const r = Math.round(Math.random() * 100000000000) + "";
  const inner = UA + myhash(UA + myhash(UA + r + "hackers_become_a_little_stinkier_every_time_they_hack"));
  return "tryit-" + r + "-" + myhash(inner);
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function cleanAnswer(raw) {
  let out = raw.includes("\u001C") ? raw.split("\u001C")[0] : raw;
  const s = out.indexOf("\x1dTHINKING_START");
  const e = out.indexOf("\x1dTHINKING_END");
  if (s !== -1 && e !== -1) out = out.slice(0, s) + out.slice(e + "\x1dTHINKING_END".length);
  return out.trim();
}

async function askDeepAI(model, history) {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("chatHistory", JSON.stringify(history));
  fd.append("chat_style", "ai-code");
  fd.append("enabled_tools", JSON.stringify(["image_generator", "image_editor"]));
  fd.append("hacker_is_stinky", "very_stinky");
  fd.append("memory_enabled", "false");
  fd.append("sensitivity_request_id", uuidv4());
  fd.append("session_uuid", uuidv4());
  fd.append("thinking_support", "1");
  fd.append("attachment_uuids", "[]");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "api-key": generateIslandKey(),
      "user-agent": UA,
      origin: "https://deepai.org",
      referer: PAGE,
      accept: "*/*",
    },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 150)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { value, done: end } = await reader.read();
    if (end) break;
    let chunk = dec.decode(value, { stream: true });
    if (buf && buf.includes("\u001C")) chunk = "";
    buf += chunk;
    if (buf.includes("\u001C")) {
      buf = buf.split("\u001C")[0];
      done = true;
    }
  }

  return cleanAnswer(buf);
}

module.exports = [
  {
    name: "DeepAI",
    desc: "Asisten AI serbaguna dari DeepAI untuk tanya jawab umum, pembuatan teks, hingga analisis kode",
    category: "AI",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      prompt: { type: "string", required: true, example: "Halo nama saya Melvin, kamu siapa?" },
      chatid: { type: "string", required: false, example: "user-session-123 (opsional)" },
      model: { 
        type: "select", 
        required: false, 
        example: "chat", 
        selection: AVAILABLE_MODELS 
      }
    },
    path: "/api/ai/deepai",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const prompt = req.query.prompt || req.body?.prompt;
      const model = req.query.model || req.body?.model || "chat";
      let chatId = req.query.chatid || req.body?.chatid;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!prompt) {
        return res.json({ status: false, error: "Parameter 'prompt' wajib diisi" });
      }

      if (!chatId) {
        chatId = `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      }

      if (!sessions.has(chatId)) {
        sessions.set(chatId, []);
      }
      const history = sessions.get(chatId);

      history.push({ role: "user", content: prompt });

      try {
        const answer = await askDeepAI(model, history);

        history.push({ role: "assistant", content: answer });

        if (history.length > 20) {
          history.splice(0, history.length - 20);
        }

        return res.json({
          status: true,
          result: {
            chatId: chatId,
            model: model,
            prompt: prompt,
            response: answer
          }
        });
      } catch (err) {
        history.pop();
        console.error("DeepAI Error:", err);
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal memproses permintaan ke DeepAI"
        });
      }
    }
  }
];
