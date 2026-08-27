const BASE = 'https://igwatcher.com';

const headers = {
  'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'referer': 'https://igwatcher.com/',
  'origin': 'https://igwatcher.com'
};

function extractUsername(input) {
  let raw = input.trim();
  raw = raw.replace(/^@/, '');
  raw = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
  raw = raw.replace(/^https?:\/\/instagr\.am\//i, '');
  raw = raw.replace(/\/$/, '');
  raw = raw.split('/')[0].split('?')[0];
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(raw)) {
    throw new Error(`Invalid username: "${raw}"`);
  }
  return raw.toLowerCase();
}

async function jget(url, timeoutMs = 40000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal, headers });
    clearTimeout(timer);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, json, text };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { ok: false, status: 0, json: null, text: '', timedOut: true };
    }
    throw e;
  }
}

async function getProfile(username) {
  const url = `${BASE}/wp-json/igw/v1/search?username=${encodeURIComponent(username)}`;
  const res = await jget(url, 40000);
  if (!res.ok) throw new Error(`Profile request failed (HTTP ${res.status})`);
  return res.json;
}

async function getPosts(username, limit = 24, maxId = null) {
  let url = `${BASE}/wp-json/igw/v1/posts?username=${encodeURIComponent(username)}&limit=${limit}`;
  if (maxId) url += `&maxId=${encodeURIComponent(maxId)}`;
  const res = await jget(url, 55000);
  if (!res.ok) throw new Error(`Posts request failed (HTTP ${res.status})`);
  return res.json;
}

async function getStories(username) {
  const url = `${BASE}/wp-json/igw/v1/stories?username=${encodeURIComponent(username)}`;
  const res = await jget(url, 58000);
  if (!res.ok) throw new Error(`Stories request failed (HTTP ${res.status})`);
  return res.json;
}

async function getHighlights(username) {
  const url = `${BASE}/wp-json/igw/v1/highlights?username=${encodeURIComponent(username)}`;
  const res = await jget(url, 58000);
  if (!res.ok) throw new Error(`Highlights request failed (HTTP ${res.status})`);
  return res.json;
}

async function getReels(username, limit = 24, maxId = null) {
  let url = `${BASE}/api/reels?username=${encodeURIComponent(username)}&limit=${limit}`;
  if (maxId) url += `&maxId=${encodeURIComponent(maxId)}`;
  const res = await jget(url, 55000);
  if (!res.ok) throw new Error(`Reels request failed (HTTP ${res.status})`);
  return res.json;
}

async function getTagged(username, limit = 24, maxId = null) {
  let url = `${BASE}/wp-json/igw/v1/tagged?username=${encodeURIComponent(username)}&limit=${limit}`;
  if (maxId) url += `&maxId=${encodeURIComponent(maxId)}`;
  const res = await jget(url, 50000);
  if (!res.ok) throw new Error(`Tagged request failed (HTTP ${res.status})`);
  return res.json;
}

async function stalkInstagram(target) {
  const username = extractUsername(target);
  const result = { username };

  const profile = await getProfile(username);
  result.profile = profile;

  if (profile.note === 'profile_unavailable') {
    throw new Error('Profile not found or is private');
  }

  const tasks = [
    getPosts(username).then(d => { result.posts = d; }).catch(e => { result.posts_error = e.message; }),
    getStories(username).then(d => { result.stories = d; }).catch(e => { result.stories_error = e.message; }),
    getReels(username).then(d => { result.reels = d; }).catch(e => { result.reels_error = e.message; }),
    getHighlights(username).then(d => { result.highlights = d; }).catch(e => { result.highlights_error = e.message; }),
    getTagged(username).then(d => { result.tagged = d; }).catch(e => { result.tagged_error = e.message; })
  ];

  await Promise.all(tasks);
  return result;
}

module.exports = [
  {
    name: "Instagram Stalk",
    desc: "Stalk profil Instagram secara lengkap (Posts, Stories, Reels, Highlights, Tagged)",
    category: "Stalker",
    parameters: {
      apikey: { type: "string" },
      username: { type: "string" }
    },
    path: "/api/stalk/instagram",
    async run(req, res) {
      const { apikey, username } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!username) {
        return res.json({ status: false, error: "Username is required" });
      }

      try {
        const result = await stalkInstagram(username);

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
