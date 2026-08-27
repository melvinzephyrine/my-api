const axios = require('axios');
const cheerio = require('cheerio');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const generatorEmail = {
  api: { base: 'https://generator.email/', validate: 'uptime.php' },
  defaultHeaders: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    'Referer': 'https://generator.email/'
  },
  _cookie: '',

  async _f(u, o = {}, r = 3) {
    for (let i = 0; i < r; i++) {
      try {
        const headers = { ...this.defaultHeaders, ...(o.headers || {}) };
        if (this._cookie && !headers.Cookie) headers.Cookie = this._cookie;
        const res = await axios({
          url: u,
          method: o.method || 'GET',
          headers,
          data: o.body,
          timeout: 15000,
          validateStatus: s => s < 500,
          responseType: o._t ? 'text' : 'json'
        });
        const sc = res.headers['set-cookie'];
        if (sc) {
          for (const c of sc) {
            const [pair] = c.split(';');
            const [k] = pair.split('=');
            const keep = this._cookie.split('; ').filter(p => p && !p.startsWith(k + '='));
            keep.push(pair);
            this._cookie = keep.join('; ');
          }
        }
        return res.data;
      } catch (e) {
        if (i === r - 1) throw e;
        await sleep(800);
      }
    }
  },

  async generate() {
    this._cookie = 'samesite=lax;';
    const rand = Math.random().toString(36).substring(2, 11);
    const path = 'ichecker.tech/' + rand + '/';
    this._cookie += ' inbox_ctx=' + encodeURIComponent(path) + ';';

    await this._f(this.api.base, { headers: { Cookie: this._cookie }, _t: 1 });
    await sleep(700);
    await this._f(this.api.base, { headers: { Cookie: this._cookie }, _t: 1 });
    await sleep(500);

    const h = await this._f(this.api.base, { headers: { Cookie: this._cookie }, _t: 1 });
    const $ = cheerio.load(h);
    let em = $('#email_ch_text').text().trim();

    if (!em) {
      await sleep(1000);
      const h2 = await this._f(this.api.base, { headers: { Cookie: this._cookie }, _t: 1 });
      em = cheerio.load(h2)('#email_ch_text').text().trim();
    }

    if (!em) throw new Error('Gagal generate email');

    const [u, d] = em.split('@');
    await this._f(this.api.base + this.api.validate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: u, dmn: d })
    });

    for (let i = 0; i < 5; i++) {
      await this.inbox(em);
      await sleep(900);
    }

    return em;
  },

  async inbox(em) {
    const [u, d] = em.split('@');
    const ck = 'inbox_ctx=' + encodeURIComponent(d + '/' + u + '/');
    try {
      const h = await this._f(this.api.base, { headers: { Cookie: ck }, _t: 1 });
      if (typeof h === 'string' && h.includes('Email generator is ready')) return [];
      const $ = cheerio.load(h || '');
      const ib = [];
      const rows = $('[onclick]').toArray();
      for (const row of rows) {
        const onclick = $(row).attr('onclick') || '';
        const match = onclick.match(/loadInboxClientSide\('([^']+)'\)/) || onclick.match(/'([^']+)'/);
        if (!match || !match[1].includes('/')) continue;
        try {
          const html = await this._f(this.api.base + 'inbox1/', {
            headers: { Cookie: 'inbox_ctx=' + encodeURIComponent(match[1]) },
            _t: 1
          });
          const m = cheerio.load(html);
          const from = m('.from_div_45g45gg').text().trim() || m('.wbreak').eq(1).text().trim();
          const subject = m('.subj_div_45g45gg').text().trim() || m('.subj-h1').text().trim();
          const created = m('.time_div_45g45gg').text().trim();
          const message = m('.mess_bodiyy').first().text().trim();
          const links = [];
          m('.mess_bodiyy').first().find('a').each((i, el) => {
            let href = m(el).attr('href');
            if (href) links.push(href.startsWith('http') ? href : new URL(href, this.api.base).href);
          });
          if (from || subject || message) ib.push({ from, to: em, created, subject, message, links });
        } catch {}
      }
      return ib;
    } catch {
      return [];
    }
  }
};

module.exports = {
  name: "Temp-Mail",
  desc: "Generate temporary email otomatis",
  category: "Tools",
  parameters: {
    apikey: { type: "string" }
  },
  path: "/api/tools/tempmail",
  async run(req, res) {
    const { apikey } = req.query;
    if (!apikey || !global.apikey.includes(apikey))
      return res.json({ status: false, error: "Apikey invalid" });

    try {
      const email = await generatorEmail.generate();
      return res.json({
        status: true,
        creator: "t.me/luyatiem",
        success: true,
        email,
        emailStatus: "good"
      });
    } catch (err) {
      res.status(500).json({ status: false, error: err.message });
    }
  }
};
