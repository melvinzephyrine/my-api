const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const HASH = {
   track: '612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294',
   search: 'eff59fa0a3d026b88b56fddbcf4bdfa16a186b8175a5c1a358c072e053c2e5b0'
};

let cachedToken = null;

function duration(ms) {
   if (!ms) return '0:00';
   const m = Math.floor(ms / 60000);
   const s = Math.floor((ms % 60000) / 1000);
   return m + ':' + String(s).padStart(2, '0');
}

async function getHtml(url) {
   const res = await fetch(url, { headers: { 'User-Agent': UA } });
   if (!res.ok) return null;
   return res.text();
}

async function getAccessToken() {
   if (cachedToken) return cachedToken;
   const html = await getHtml('https://open.spotify.com/embed/track/6PQ88X9TkUIAUIZJHW2upE');
   if (!html) return null;
   const m = html.match(/__NEXT_DATA__.*?>(.*?)<\/script/s);
   if (!m) return null;
   try {
      cachedToken = JSON.parse(m[1]).props.pageProps.state.settings.session.accessToken;
      return cachedToken;
   } catch {
      return null;
   }
}

async function graph(op, hash, variables) {
   const token = await getAccessToken();
   if (!token) return { error: 'Failed to get access token' };
   const path = '/pathfinder/v1/query?operationName=' + op + '&variables=' + encodeURIComponent(JSON.stringify(variables)) + '&extensions=' + encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }));
   const res = await fetch('https://api-partner.spotify.com' + path, {
      headers: {
         'Authorization': 'Bearer ' + token,
         'User-Agent': UA
      }
   });
   if (!res.ok) return { error: op + ' failed: ' + res.status };
   const data = await res.json();
   if (data.errors && data.errors.length) return { error: data.errors[0].message };
   return data.data;
}

function imgUrl(img) {
   if (!img) return null;
   const sources = img.sources || (img.items && img.items[0] && img.items[0].sources) || (img.image && img.image.sources) || (img.coverArt && img.coverArt.sources);
   return sources && sources[0] ? sources[0].url : null;
}

function artistsName(items) {
   return (items || []).map(function (a) {
      return (a.profile && a.profile.name) || a.name || '';
   });
}

function unwrap(item) {
   return (item.item && item.item.data) || item.data || item;
}

function fmtSearchTrack(d) {
   return {
      type: 'track',
      name: d.name,
      id: d.id,
      uri: d.uri,
      artists: artistsName(d.artists && d.artists.items),
      album: d.albumOfTrack ? d.albumOfTrack.name : null,
      duration: d.duration ? duration(d.duration.totalMilliseconds) : null,
      explicit: d.contentRating && d.contentRating.label === 'EXPLICIT',
      cover: imgUrl(d.albumOfTrack && d.albumOfTrack.coverArt) || imgUrl(d.visualIdentity)
   };
}

async function spotifySearch(query) {
   const variables = {
      searchTerm: query,
      offset: 0,
      limit: 10,
      numberOfTopResults: 5,
      includeAudiobooks: false,
      includePreReleases: false,
      includeAlbumPreReleases: false,
      includeAuthors: false,
      includeEpisodeContentRatingsV2: false
   };
   const data = await graph('searchDesktop', HASH.search, variables);
   if (data.error) throw new Error(data.error);
   
   const sv = data && data.searchV2;
   if (!sv) return [];
   
   return sv.tracksV2 ? sv.tracksV2.items.map(unwrap).map(fmtSearchTrack) : [];
}

module.exports = [
  {
    name: "Spotify Search",
    desc: "Cari lagu di Spotify berdasarkan kata kunci",
    category: "Search",
    parameters: {
      apikey: { type: "string" },
      query: { type: "string" }
    },
    path: "/api/search/spotify",
    async run(req, res) {
      const { apikey, query } = req.query;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!query) {
        return res.json({ status: false, error: "Query is required" });
      }

      try {
        const result = await spotifySearch(query);

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
