const axios = require('axios');
const crypto = require('crypto');

const cooldowns = new Map();

class AlightMotionAuth {
    constructor() {
        this.ORDER_ID = "melvin";
        this.API_KEY = "AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0";
        this.PRODUCT_ID = "am.full.sub.annual.19q4";
        this.TOKEN = "mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw";
        this.SKU_TYPE = "subs";
        this.FIREBASE_INSTANCE_ID_TOKEN = "cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI";
        this.HEADERS = {
            "Content-Type": "application/json",
            "X-Android-Package": "com.alightcreative.motion",
            "X-Android-Cert": "ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8",
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 15; 23127PN0CC Build/BP1A.250505.005)"
        };
    }

    async sendMagicLink(email) {
        try {
            await axios.post(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/createAuthUri?key=${this.API_KEY}`, { identifier: email, continueUri: "http://localhost" }, { headers: this.HEADERS });
            await axios.post(`https://www.googleapis.com/identitytoolkit/v3/relyingparty/getOobConfirmationCode?key=${this.API_KEY}`, {
                requestType: 6,
                email: email,
                androidInstallApp: true,
                canHandleCodeInApp: true,
                continueUrl: "https://alightcreative.com?ui_sid=0366624874&ui_sd=0",
                iosBundleId: "com.alightcreative.motion",
                androidPackageName: "com.alightcreative.motion",
                androidMinimumVersion: "585",
                clientType: "CLIENT_TYPE_ANDROID"
            }, { headers: this.HEADERS });
            return { success: true, message: "Link berhasil dikirim." };
        } catch (error) {
            const errData = error.response?.data ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) : error.message;
            return { success: false, error: errData };
        }
    }
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.ip;
}

module.exports = {
  name: "Send Magic Link",
  desc: "Kirim magic link ke email untuk aktivasi premium Alight Motion",
  category: "Premium",
  parameters: {
    apikey: { type: "string" },
    email: { type: "string" }
  },
  path: "/api/prem/am-send",
  async run(req, res) {
    const { apikey, email } = req.query;

    if (!apikey || !global.apikey.includes(apikey)) {
      return res.json({ status: false, error: "Apikey invalid" });
    }

    if (!email) {
      return res.json({ status: false, error: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.json({ status: false, error: "Format email tidak valid" });
    }

    const clientIP = getClientIP(req);
    const cooldownKey = `send_${clientIP}`;
    const now = Date.now();
    const cooldownTime = 5 * 60 * 1000; // 5 menit

    if (cooldowns.has(cooldownKey)) {
      const lastRequest = cooldowns.get(cooldownKey);
      if (now - lastRequest < cooldownTime) {
        const remaining = Math.ceil((cooldownTime - (now - lastRequest)) / 1000);
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        return res.status(429).json({
          status: false,
          error: `⏳ Cooldown: ${minutes} menit ${seconds} detik lagi`,
          cooldown: {
            remaining: remaining,
            minutes: minutes,
            seconds: seconds
          }
        });
      }
    }

    cooldowns.set(cooldownKey, now);
    setTimeout(() => cooldowns.delete(cooldownKey), cooldownTime);

    try {
      const auth = new AlightMotionAuth();
      const result = await auth.sendMagicLink(email.trim());

      if (!result.success) {
        return res.status(400).json({
          status: false,
          error: result.error || "Gagal mengirim magic link"
        });
      }

      return res.json({
        status: true,
        creator: "t.me/luyatiem",
        message: "Link berhasil dikirim ke email.",
        data: {
          email: email.trim(),
          note: "Cek inbox/spam, salin link lalu gunakan /alight/verify untuk aktivasi"
        }
      });

    } catch (err) {
      return res.status(500).json({
        status: false,
        creator: "t.me/luyatiem",
        error: err.message || "Terjadi kesalahan internal"
      });
    }
  }
};