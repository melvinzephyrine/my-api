const axios = require('axios');

async function getLyrics(queryOrTrack, artist = '') {
  let trackName = queryOrTrack;
  let artistName = artist;

  if (queryOrTrack.includes('spotify.com/track/')) {
    const match = queryOrTrack.match(/track\/([a-zA-Z0-9]+)/);
    if (match) {
      try {
        const oembed = await axios.get(
          `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${match[1]}`,
          { timeout: 5000 }
        );
        trackName = oembed.data?.title?.replace(/\(feat\..*?\)/i, '').trim() || trackName;

        const resEmbed = await axios.get(`https://open.spotify.com/embed/track/${match[1]}`, { timeout: 5000 });
        const matchArtist = resEmbed.data.match(/"artists":\[\{"name":"([^"]+)"/);
        if (matchArtist) {
          artistName = matchArtist[1];
        }
      } catch (_) {}
    }
  }

  try {
    const res = await axios.get('https://lrclib.net/api/get', {
      params: {
        track_name: trackName,
        artist_name: artistName,
      },
      timeout: 10000,
    });

    if (res.data && (res.data.plainLyrics || res.data.syncedLyrics)) {
      return {
        trackName: res.data.trackName || trackName,
        artistName: res.data.artistName || artistName,
        albumName: res.data.albumName,
        duration: res.data.duration,
        plainLyrics: res.data.plainLyrics,
        syncedLyrics: res.data.syncedLyrics,
      };
    }
  } catch (_) {}

  try {
    const searchRes = await axios.get('https://lrclib.net/api/search', {
      params: {
        q: `${trackName} ${artistName}`.trim(),
      },
      timeout: 10000,
    });

    if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
      const best = searchRes.data[0];
      return {
        trackName: best.trackName,
        artistName: best.artistName,
        albumName: best.albumName,
        duration: best.duration,
        plainLyrics: best.plainLyrics,
        syncedLyrics: best.syncedLyrics,
      };
    }
  } catch (err) {
    throw new Error(err.message || 'Gagal mengambil lirik');
  }

  throw new Error('Lirik lagu tidak ditemukan');
}

module.exports = [
  {
    name: "Spotify Lyrics",
    desc: "Cari lirik lagu Spotify berdasarkan judul, nama artis, atau link track Spotify",
    category: "Search",
    parameters: {
      apikey: { type: "string" },
      query: { type: "string" },
      artist: { type: "string" }
    },
    path: "/api/search/spotify-lyrics",
    async run(req, res) {
      const { apikey, query, artist } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Query is required" });
      }

      try {
        const result = await getLyrics(query, artist || '');

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
