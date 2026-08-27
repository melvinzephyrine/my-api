const axios = require('axios');

async function getPackageTarball(packageInput) {
  try {
    let pkg = packageInput.trim();
    let ver = null;

    if (pkg.includes('npmjs.com/package/')) {
      const urlPath = new URL(pkg).pathname;
      pkg = urlPath.split('/package/')[1];
    }

    if (pkg.includes('/v/')) {
      const parts = pkg.split('/v/');
      pkg = parts[0];
      ver = parts[1];
    } else if (pkg.includes('@') && !pkg.startsWith('@')) {
      const parts = pkg.split('@');
      pkg = parts[0];
      ver = parts[1];
    }

    const endpoint = ver 
      ? `https://registry.npmjs.org/${encodeURIComponent(pkg)}/${ver}`
      : `https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`;

    const metaRes = await axios.get(endpoint, {
      headers: { 'accept': 'application/json' }
    });

    const meta = metaRes.data;
    const tarballUrl = meta?.dist?.tarball;

    if (!tarballUrl) {
      return { status: false, error: "Gagal menemukan URL tarball paket NPM" };
    }

    const headRes = await axios.head(tarballUrl);
    const contentLength = parseInt(headRes.headers['content-length'] || '0', 10);
    const fileName = tarballUrl.split('/').pop();

    return {
      status: true,
      result: {
        name: meta.name,
        version: meta.version,
        file: fileName,
        size: contentLength,
        sizeFormatted: contentLength > 0 ? (contentLength / 1024).toFixed(2) + " KB" : "N/A",
        downloadUrl: tarballUrl,
        shasum: meta.dist?.shasum || null,
        integrity: meta.dist?.integrity || null
      }
    };
  } catch (error) {
    return {
      status: false,
      error: error.response?.status === 404 ? 'Paket atau versi NPM tidak ditemukan' : (error.message || 'Terjadi kesalahan')
    };
  }
}

module.exports = [
  {
    name: "NPM Package Downloader",
    desc: "Dapatkan info detail & link download file tarball (.tgz) dari paket NPM",
    category: "Downloader",
    parameters: {
      apikey: { 
        type: "string", 
        required: true, 
        example: "mlvn" 
      },
      package: { 
        type: "string", 
        required: true, 
        example: "express" 
      }
    },
    path: "/api/download/npmdl",
    async run(req, res) {
      const apikey = req.query.apikey || req.body?.apikey;
      const packageInput = req.query.package || req.body?.package || req.query.url;

      if (!global.apikey.includes(apikey)) {
        return res.json({ status: false, error: "Apikey invalid" });
      }

      if (!packageInput) {
        return res.json({ status: false, error: "Parameter package/URL wajib diisi" });
      }

      const result = await getPackageTarball(packageInput);
      return res.json(result);
    }
  }
];
