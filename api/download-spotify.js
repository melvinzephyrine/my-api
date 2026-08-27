const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

function formatSpotifyUrl(input) {
  let cleanInput = input.trim();

  if (cleanInput.includes('spotify.com/track/')) {
    const match = cleanInput.match(/track\/([a-zA-Z0-9]+)/);
    if (match) return `https://open.spotify.com/track/${match[1]}`;
  }

  if (/^[a-zA-Z0-9]{22}$/.test(cleanInput)) {
    return `https://open.spotify.com/track/${cleanInput}`;
  }

  return cleanInput;
}

async function musicfab(inputUrl) {
  if (!inputUrl || typeof inputUrl !== "string") {
    throw new Error("Url / Track ID is required");
  }

  const targetUrl = formatSpotifyUrl(inputUrl);

  const res = await fetch("https://musicfab.io/api/spotify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://musicfab.io",
      Referer: "https://musicfab.io/"
    },
    body: JSON.stringify({ url: targetUrl })
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status}`);
  }

  const resData = await res.json();
  const result = resData?.data?.metadata;

  if (!result || !result.download) {
    throw new Error("Gagal mendapatkan result / link download");
  }

  return {
    title: result.name || "Unknown",
    artist: result.artist || "Unknown",
    album: result.album || "Unknown",
    duration: result.duration || "Unknown",
    image: result.image || "Image Not Found",
    download: result.download
  };
}

module.exports = [
  {
    name: "Spotify Downloader",
    desc: "Download lagu Spotify menggunakan URL Track atau Track ID",
    category: "Downloader",
    parameters: {
      apikey: { type: "string" },
      url: { type: "string" }
    },
    path: "/api/download/spotify",
    async run(req, res) {
      const { apikey, url } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!url) {
        return res.json({ status: false, error: "Url or Track ID is required" });
      }

      try {
        const result = await musicfab(url);

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
