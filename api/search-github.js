const GITHUB_TOKEN = "";

async function searchRepos(q, customToken = "") {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`;
  const token = customToken || GITHUB_TOKEN;

  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "node-github-search"
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    mode: token ? "token" : "normal",
    query: q,
    total_count: data.total_count || 0,
    items: (data.items || []).map((repo) => ({
      full_name: repo.full_name,
      stars: repo.stargazers_count,
      language: repo.language || null,
      description: repo.description || null,
      url: repo.html_url
    }))
  };
}

module.exports = [
  {
    name: "GitHub Search",
    desc: "Cari repositori GitHub berdasarkan kata kunci",
    category: "Search",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      query: { type: "string", required: true, example: "Claude code" },
      token: { type: "string", required: false, example: "ghp_xxx (opsional)" }
    },
    path: "/api/search/github-repo",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const query = req.query.query || req.body?.query || req.query.q || req.body?.q;
      const token = req.query.token || req.body?.token || "";

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Parameter 'query' wajib diisi" });
      }

      try {
        const result = await searchRepos(query, token);
        return res.json({
          status: true,
          result
        });
      } catch (err) {
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal mencari repositori GitHub"
        });
      }
    }
  }
];