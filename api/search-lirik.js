const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

async function searchSongs(query) {
  const url = `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  
  if (response.status !== 200) return [];

  const sections = response.data?.response?.sections || [];
  const songs = [];
  const seenIds = new Set();

  for (const section of sections) {
    const hits = section.hits || [];
    for (const hit of hits) {
      const result = hit.result || {};
      const hitType = hit.type;
      const _type = result._type;

      if (hitType === 'song' || _type === 'song') {
        const songId = result.id;
        if (songId && !seenIds.has(songId)) {
          seenIds.add(songId);
          songs.push({
            title: result.title,
            artist: result.artist_names,
            path: result.path,
            image: result.header_image_url,
            release_date: result.release_date_for_display || null
          });
        }
      }
    }
  }
  return songs;
}

async function getLyrics(songPath) {
  const url = songPath.startsWith('/') ? `https://genius.com${songPath}` : songPath;
  const response = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  
  if (response.status !== 200) return null;

  const $ = cheerio.load(response.data);
  const containers = $('div[data-lyrics-container="true"]');
  let lyricsList = [];

  containers.each((i, elem) => {
    const container = $(elem);
    container.find('[data-exclude-from-selection="true"]').remove();
    container.find('br').replaceWith('\n');
    lyricsList.push(container.text());
  });

  return lyricsList.join('\n').trim() || null;
}

module.exports = [
  {
    name: "Lyrics Search",
    desc: "Mencari lirik lagu berdasarkan judul atau penyanyi",
    category: "Search",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      query: { type: "string", required: true, example: "Sertakan lagu nostalgia" }
    },
    path: "/api/search/lyrics",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const query = req.query.query || req.body?.query || req.query.q;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Parameter 'query' wajib diisi" });
      }

      try {
        const songs = await searchSongs(query);

        if (!songs || songs.length === 0) {
          return res.status(404).json({
            status: false,
            error: "Lirik lagu tidak ditemukan"
          });
        }

        const selectedSong = songs[0];
        const lyrics = await getLyrics(selectedSong.path);

        if (!lyrics) {
          return res.status(500).json({
            status: false,
            error: "Gagal mengambil lirik dari halaman lagu"
          });
        }

        return res.json({
          status: true,
          result: {
            title: selectedSong.title,
            artist: selectedSong.artist,
            release_date: selectedSong.release_date,
            image: selectedSong.image,
            lyrics: lyrics
          }
        });
      } catch (err) {
        console.error("Lyrics Search Error:", err);
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal memproses pencarian lirik"
        });
      }
    }
  }
];
