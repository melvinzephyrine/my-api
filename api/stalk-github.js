const axios = require("axios");
const cheerio = require("cheerio");

class GitHubStalker {
  constructor() {
    this.client = axios.create({
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
      },
      timeout: 30000
    });
  }

  async _fetchAPI(path) {
    try {
      const response = await this.client.get(`https://api.github.com${path}`, {
        headers: {
          Accept: "application/vnd.github.v3+json"
        }
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error(`User atau data tidak ditemukan di GitHub: ${path}`);
      }
      throw new Error(`Gagal mengambil data API GitHub: ${error.message}`);
    }
  }

  async _scrapePage(username) {
    try {
      const response = await this.client.get(`https://github.com/${username}`, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
        }
      });
      return cheerio.load(response.data);
    } catch (error) {
      throw new Error(`Gagal melakukan scraping halaman GitHub: ${error.message}`);
    }
  }

  _format(apiData, $, orgsData) {
    const statusEmoji = $(".user-status-emoji-container div").first().text().trim() || null;
    const statusMessage = $(".user-status-message-wrapper div").first().text().trim() || null;
    const pinnedRepos = [];

    $("ol.js-pinned-items-reorder-list li").each((i, el) => {
      const repo = $(el).find("div.pinned-item-list-item-content");
      if (repo.length) {
        pinnedRepos.push({
          name: repo.find("span.repo").text().trim(),
          description: repo.find("p.pinned-item-desc").text().trim() || "No description",
          url: `https://github.com${repo.find("a").attr("href")}`,
          stars: parseInt(repo.find('a[href$="/stargazers"]').text().trim().replace(/,/g, "")) || 0,
          forks: parseInt(repo.find('a[href$="/forks"]').text().trim().replace(/,/g, "")) || 0,
          language: repo.find('span[itemprop="programmingLanguage"]').text().trim() || "N/A"
        });
      }
    });

    const contributionsText = $(".js-yearly-contributions h2").text().trim();
    const contributionsMatch = contributionsText.match(/(\d{1,3}(,\d{3})*|\d+)/);
    const achievements = [];

    $('img[data-hovercard-type="achievement"]').each((i, el) => {
      const name = $(el).attr("alt");
      if (name && !achievements.some(ach => ach.name === name)) {
        achievements.push({
          name: name,
          image: $(el).attr("src")
        });
      }
    });

    const socials = {};
    $("ul.vcard-details li a").each((i, el) => {
      const href = $(el).attr("href");
      if (href) {
        let key;
        if (href.includes("twitter.com") || href.includes("x.com")) {
          key = "twitter";
        } else if (href.includes("linkedin.com")) {
          key = "linkedin";
        } else {
          try {
            key = new URL(href).hostname.replace("www.", "").split(".")[0];
          } catch (e) {
            key = `website_${i}`;
          }
        }
        socials[key] = href;
      }
    });

    return {
      profile: {
        username: apiData.login,
        name: apiData.name,
        avatar: apiData.avatar_url,
        bio: apiData.bio,
        status: {
          emoji: statusEmoji,
          message: statusMessage
        },
        pronouns: $('span[itemprop="pronouns"]').text().trim() || null,
        company: apiData.company,
        location: apiData.location,
        website: apiData.blog,
        email: apiData.email,
        socials: socials,
        stats: {
          followers: apiData.followers,
          following: apiData.following,
          publicRepos: apiData.public_repos,
          publicGists: apiData.public_gists
        },
        timestamps: {
          createdAt: apiData.created_at,
          updatedAt: apiData.updated_at
        },
        urls: {
          profile: apiData.html_url,
          api: apiData.url
        }
      },
      organizations: orgsData.map(org => ({
        name: org.login,
        avatar: org.avatar_url,
        description: org.description
      })),
      contributions: {
        lastYear: contributionsMatch ? contributionsMatch[0].replace(/,/g, "") : "0"
      },
      achievements: achievements,
      pinnedRepos: pinnedRepos
    };
  }

  async stalker(username) {
    const apiData = await this._fetchAPI(`/users/${username}`);
    const orgsData = await this._fetchAPI(`/users/${username}/orgs`);
    const $ = await this._scrapePage(username);
    return this._format(apiData, $, orgsData);
  }
}

const stalkerInstance = new GitHubStalker();

module.exports = [
  {
    name: "GitHub Stalk",
    desc: "Stalk profil GitHub secara detail (Repositori Pinned, Kontribusi, Achievement, Organisasi, dan Sosial Media)",
    category: "Stalker",
    method: "GET",
    parameters: {
      apikey: { type: "string", required: true },
      username: { type: "string", required: true, example: "user" }
    },
    path: "/api/stalk/github",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const username = req.query.username || req.body?.username;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!username) {
        return res.json({ status: false, error: "Username GitHub wajib diisi" });
      }

      try {
        const result = await stalkerInstance.stalker(username.trim().replace(/^@/, ''));

        return res.json({
          status: true,
          result
        });
      } catch (err) {
        return res.status(500).json({
          status: false,
          error: err.message || "Gagal melakukan stalking di GitHub"
        });
      }
    }
  }
];
