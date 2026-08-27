const { translate } = require('deeplx');

const SUPPORTED_LANGUAGES = {
  "AR": "Arabic (Arab)",
  "BG": "Bulgarian",
  "CS": "Czech",
  "DA": "Danish",
  "DE": "German (Jerman)",
  "EL": "Greek",
  "EN": "English (Inggris)",
  "ES": "Spanish (Spanyol)",
  "ET": "Estonian",
  "FI": "Finnish",
  "FR": "French (Prancis)",
  "HU": "Hungarian",
  "ID": "Indonesian (Indonesia)",
  "IT": "Italian (Italia)",
  "JA": "Japanese (Jepang)",
  "KO": "Korean (Korea)",
  "LT": "Lithuanian",
  "LV": "Latvian",
  "NB": "Norwegian Bokmål",
  "NL": "Dutch (Belanda)",
  "PL": "Polish",
  "PT": "Portuguese (Portugis)",
  "RO": "Romanian",
  "RU": "Russian (Rusia)",
  "SK": "Slovak",
  "SL": "Slovenian",
  "SV": "Swedish",
  "TR": "Turkish (Turki)",
  "UK": "Ukrainian",
  "ZH": "Chinese (Mandarin)"
};

module.exports = [
  {
    name: "Translator",
    desc: "Menerjemahkan teks ke berbagai bahasa",
    category: "Tools",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      text: { type: "string", required: true, example: "Halo Dunia" },
      target_lang: { 
        type: "select", 
        required: false, 
        example: "EN", 
        selection: Object.keys(SUPPORTED_LANGUAGES) 
      }
    },
    path: "/api/tools/deepl",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const text = req.query.text || req.body?.text;
      const targetLang = (req.query.target_lang || req.body?.target_lang || "EN").toUpperCase();

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!text) {
        return res.json({ status: false, error: "Parameter 'text' wajib diisi" });
      }

      if (!SUPPORTED_LANGUAGES[targetLang]) {
        return res.status(400).json({
          status: false,
          error: `Kode bahasa '${targetLang}' tidak didukung`,
          supported_languages: SUPPORTED_LANGUAGES
        });
      }

      try {
        const result = await translate(text, targetLang);
        return res.json({
          status: true,
          result: {
            original_text: text,
            target_language: targetLang,
            language_name: SUPPORTED_LANGUAGES[targetLang],
            translated_text: typeof result === "object" ? result.data || result : result
          }
        });
      } catch (err) {
        console.error("DeepL Error:", err);
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal menerjemahkan teks menggunakan DeepL"
        });
      }
    }
  }
];
