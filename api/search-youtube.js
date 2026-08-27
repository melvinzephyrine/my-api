const yts = require('yt-search');

async function searchYouTube(query) {
  const res = await yts(query);
  
  const videos = res.videos.slice(0, 20).map(v => ({
    title: v.title,
    url: v.url,
    videoId: v.videoId,
    duration: v.timestamp,
    seconds: v.seconds,
    views: v.views,
    published: v.ago,
    thumbnail: v.thumbnail,
    author: {
      name: v.author.name,
      url: v.author.url
    }
  }));

  return videos;
}

module.exports = [
  {
    name: "YouTube Search",
    desc: "Search video di YouTube berdasarkan kata kunci",
    category: "Search",
    parameters: {
      apikey: { type: "string" },
      query: { type: "string" }
    },
    path: "/api/search/youtube",
    async run(req, res) {
      const { apikey, query } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Query is required" });
      }

      try {
        const result = await searchYouTube(query);

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