const axios = require('axios');

async function askAlphaAI(prompt) {
  const response = await axios.post(
    "https://opencode.ai/zen/v1/chat/completions",
    {
      model: "x-preview-f-free",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    },
    {
      headers: {
        "Authorization": "Bearer sk-TQpj9mSJvwu3D2LVCme62K3GGecetGPDDLY24h6E3bHNvPSsFV2XSm3Fk2o1h9qL",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      },
      timeout: 30000
    }
  );

  const choices = response.data?.choices;
  if (!choices || choices.length === 0) {
    throw new Error("Tidak ada respon dari server 0x Alpha AI");
  }

  return choices[0].message?.content || "";
}

module.exports = [
  {
    name: "0x Alpha",
    desc: "Asisten AI cerdas berbasis model 0x Alpha",
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
      }
    },
    path: "/api/ai/0xalpha",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const prompt = req.query.prompt || req.body?.prompt;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!prompt) {
        return res.json({ status: false, error: "Parameter prompt pertanyaan wajib diisi" });
      }

      try {
        const answer = await askAlphaAI(prompt);
        return res.json({
          status: true,
          result: {
            prompt: prompt,
            response: answer
          }
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.response?.data?.error?.message || error.message || "Gagal terhubung ke 0x Alpha AI"
        });
      }
    }
  }
];
