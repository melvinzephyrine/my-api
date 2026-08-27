const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const axiosRetry = require('axios-retry').default ?? require('axios-retry');

const UA_WEB = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function createClient() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({
    jar,
    withCredentials: true,
    timeout: 20000,
    maxRedirects: 10,
  }));

  axiosRetry(client, {
    retries: 3,
    retryDelay: (n) => n * 1500,
    retryCondition: (e) => !e.response || e.response.status === 429 || e.response.status >= 500,
  });

  return client;
}

function extractShortcode(input) {
  input = input.trim();
  if (!input.includes('/')) return input;
  const m = input.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function fetchViaHtml(client, shortcode) {
  const res = await client.get(`https://www.instagram.com/p/${shortcode}/`, {
    headers: {
      'User-Agent': UA_WEB,
      'Accept': 'text/html,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
    responseType: 'text',
    validateStatus: (s) => s < 500,
  });

  const html = res.data;

  const blocks = [...html.matchAll(/<script[^>]*data-sjs[^>]*>({"require":\[\[.+?)<\/script>/gs)]
    .map(m => m[1]);

  for (const block of blocks) {
    if (!block.includes('RelayPrefetchedStreamCache')) continue;
    if (!block.includes('xig_polaris')) continue;

    try {
      const json = JSON.parse(block);
      const bbox = json?.require?.[0]?.[3]?.[0]?.__bbox;
      if (!bbox?.require) continue;

      for (const req of bbox.require) {
        if (req[0] !== 'RelayPrefetchedStreamCache') continue;

        const inner = req[3]?.[1]?.__bbox;
        if (!inner) continue;

        const media = inner?.result?.data?.xig_polaris_media || inner?.data?.xig_polaris_media;
        if (!media) continue;

        const item = media.if_not_gated_logged_out || media;
        if (!item.pk && !item.code) continue;

        return { item };
      }
    } catch (e) {}
  }

  throw new Error('Tidak dapat mengekstrak data dari postingan Instagram');
}

function extractMedia(item) {
  const isVideo = item.is_video || item.media_type === 2 || item.__typename === 'GraphVideo';

  if (isVideo) {
    const versions = item.video_versions || [];
    const best = versions.sort((a, b) => (a.type || 0) - (b.type || 0))[0];
    const videoUrl = best?.url || item.video_url || null;
    const imgCandidates = item.image_versions2?.candidates || [];
    const bestThumb = imgCandidates.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const thumbnail = bestThumb?.url || item.display_url || item.thumbnail_url || null;
    return {
      type: 'video',
      url: videoUrl,
      thumbnail,
      width: item.original_width || item.dimensions?.width || null,
      height: item.original_height || item.dimensions?.height || null,
      duration: item.video_duration || null,
    };
  } else {
    const candidates = item.image_versions2?.candidates || [];
    const best = candidates.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const imageUrl = best?.url || item.display_url || item.thumbnail_url || null;
    return {
      type: 'photo',
      url: imageUrl,
      width: best?.width || item.original_width || item.dimensions?.width || null,
      height: best?.height || item.original_height || item.dimensions?.height || null,
    };
  }
}

function normalizeItem(item) {
  const isVideo = item.is_video || item.media_type === 2
    || item.__typename === 'GraphVideo'
    || item.__typename === 'XIGPolarisVideoMedia';
  const isCarousel = item.media_type === 8
    || item.__typename === 'GraphSidecar'
    || item.__typename === 'XIGPolarisCarouselMedia'
    || !!item.carousel_media
    || !!item.edge_sidecar_to_children;

  const owner = item.owner || item.user || {};
  const caption = item.edge_media_to_caption?.edges?.[0]?.node?.text
    || item.caption?.text
    || item.caption
    || item.accessibility_caption
    || '';

  const takenAt = item.taken_at || item.taken_at_timestamp || null;

  const likeCount = item.like_count ?? item.edge_media_preview_like?.count ?? null;
  const commentCount = item.comment_count ?? item.edge_media_to_comment?.count ?? null;
  const viewCount = item.view_count
    ?? item.video_view_count
    ?? item.clips_metadata?.views_count
    ?? null;

  const pad = n => String(n).padStart(2, '0');
  const postedAt = takenAt ? (() => {
    const d = new Date(Number(takenAt) * 1000);
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  })() : null;

  let media = [];
  if (isCarousel) {
    const children = item.carousel_media
      || item.edge_sidecar_to_children?.edges?.map(e => e.node)
      || [];
    for (const child of children) media.push(extractMedia(child));
  } else {
    media.push(extractMedia(item));
  }

  return {
    id: item.pk || item.id || null,
    shortcode: item.code || item.shortcode || null,
    type: isCarousel ? 'carousel' : isVideo ? 'video' : 'photo',
    caption: typeof caption === 'string' ? caption : '',
    postedAt,
    owner: {
      id: owner.pk || owner.id || null,
      username: owner.username || null,
      fullName: owner.full_name || null,
      avatar: owner.profile_pic_url || null,
      verified: !!(owner.is_verified || owner.verified || owner.is_verified_by_mv4b || owner.transparency_product_enabled),
    },
    stats: { likeCount, commentCount, viewCount },
    media,
    location: item.location ? {
      name: item.location.name || null,
      id: item.location.pk || item.location.id || null,
    } : null
  };
}

async function scrapeInstagram(inputUrl) {
  const shortcode = extractShortcode(inputUrl);
  if (!shortcode) throw new Error('Shortcode tidak ditemukan dari URL Instagram');
  const client = createClient();
  const { item } = await fetchViaHtml(client, shortcode);
  return normalizeItem(item);
}

module.exports = [
  {
    name: "Instagram Downloader",
    desc: "Unduh foto, video, carousel, dan reels dari Instagram",
    category: "Downloader",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      url: { 
        type: "string", 
        required: true, 
        example: "https://www.instagram.com//" 
      }
    },
    path: "/api/download/instagram",
    async run(req, res) {
      const apikey = req.apiKeyInput || req.query.apikey || req.body?.apikey;
      const targetUrl = req.query.url || req.body?.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!targetUrl) {
        return res.json({ status: false, error: "Parameter url Instagram wajib diisi" });
      }

      try {
        const resultData = await scrapeInstagram(targetUrl);
        return res.json({
          status: true,
          result: resultData
        });
      } catch (error) {
        return res.json({
          status: false,
          error: error.message || "Gagal mengunduh postingan Instagram"
        });
      }
    }
  }
];
