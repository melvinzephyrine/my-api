const express = require('express');
const chalk = require('chalk');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 4000;

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.enable("trust proxy");
app.set("json spaces", 2);

app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cors());

global.getBuffer = async (url, options = {}) => {
  try {
    const res = await axios({ method: 'get', url, headers: { 'DNT': 1, 'Upgrade-Insecure-Request': 1 }, ...options, responseType: 'arraybuffer' });
    return res.data;
  } catch (err) { return err; }
};

global.fetchJson = async (url, options = {}) => {
  try {
    const res = await axios({ method: 'GET', url, headers: { 'User-Agent': 'Mozilla/5.0' }, ...options });
    return res.data;
  } catch (err) { return err; }
};

const settings = {
  name: "Melvin Rest Api",
  description: "Melvin Rest Api is a simple and lightweight REST API built with Express, designed to provide easy access to various web functionalities.",
  apiSettings: { creator: "t.me/luyatiem" },
  linkWhatsapp: "https://whatsapp.com/channel/0029Vb7eLDIGzzKXAALjIO1v"
};

global.apikey = ["mlvn", "1"];

app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (data) {
    if (data && typeof data === 'object') {
      const responseData = {
        status: data.status,
        creator: "t.me/luyatiem",
        ...data
      };
      return originalJson.call(this, responseData);
    }
    return originalJson.call(this, data);
  };
  next();
});

let totalRoutes = 0;
let rawEndpoints = {};

const apiFolder = path.join(__dirname, './api');

function convertParametersForFrontend(parameters) {
  if (!parameters) return {};
  
  const converted = {};
  for (const [paramName, paramConfig] of Object.entries(parameters)) {
    converted[paramName] = {
      type: paramConfig.type || "string",
      ...(paramConfig.required !== undefined && { required: paramConfig.required }),
      ...(paramConfig.example && { example: paramConfig.example }),
      ...(paramConfig.value && { value: paramConfig.value }),
      ...(paramConfig.selection && { selection: paramConfig.selection })
    };
  }
  return converted;
}

const register = (ep, file) => {
  if (ep && ep.name && (ep.desc || ep.description) && ep.category && ep.path && typeof ep.run === "function") {
    const cleanPath = ep.path.split("?")[0];
    const method = ep.method ? ep.method.toLowerCase() : 'get';
    
    if (method === 'post') {
      app.post(cleanPath, (req, res, next) => {
        upload.any()(req, res, (err) => {
          if (err) {
            return res.status(400).json({ status: false, error: err.message || "Gagal memproses file yang diunggah" });
          }

          req.apiKeyInput = req.headers['x-apikey'] || req.headers['apikey'] || req.query?.apikey || req.body?.apikey;

          console.log(`POST ${cleanPath} - Body:`, req.body);
          console.log(`POST ${cleanPath} - Files:`, req.files ? req.files.length : 0);
          
          ep.run(req, res, next);
        });
      });
    } else {
      app.get(cleanPath, (req, res, next) => {
        req.apiKeyInput = req.headers['x-apikey'] || req.headers['apikey'] || req.query?.apikey;
        console.log(`GET ${cleanPath} - Query:`, req.query);
        ep.run(req, res, next);
      });
    }

    if (!rawEndpoints[ep.category]) rawEndpoints[ep.category] = [];
    
    const endpointData = {
      name: ep.name,
      description: ep?.description || ep?.desc || null,
      path: ep.path,
      method: ep.method || 'GET',
      parameters: convertParametersForFrontend(ep.parameters),
      ...(ep.innerDesc ? { innerDesc: ep.innerDesc } : {}),
      ...(ep.body ? { body: ep.body } : {})
    };
    
    rawEndpoints[ep.category].push(endpointData);
    totalRoutes++;
    console.log(chalk.bgHex('#FFFF99').hex('#333').bold(` Loaded Route: ${file} → ${ep.name} (${method.toUpperCase()}) `));
    
    if (ep.parameters) {
      console.log(chalk.hex('#FFA500')(`  Parameters: ${Object.keys(ep.parameters).join(', ')}`));
    }
  }
};

function loadAllEndpoints(directory) {
  let items;
  try {
    items = fs.readdirSync(directory);
  } catch (e) {
    return;
  }
  for (const item of items) {
    const fullPath = path.join(directory, item);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch (e) {
      continue;
    }
    if (stat.isDirectory()) {
      loadAllEndpoints(fullPath);
    } else if (item.endsWith('.js') && item !== 'index.js') {
      const baseName = path.relative(apiFolder, fullPath);
      try {
        delete require.cache[require.resolve(fullPath)];
        const routeModule = require(fullPath);
        if (Array.isArray(routeModule)) {
          routeModule.forEach(ep => register(ep, baseName));
        } else if (routeModule && typeof routeModule === 'object') {
          if (routeModule.endpoint) {
            register(routeModule.endpoint, baseName);
          } else {
            register(routeModule, baseName);
          }
        } else if (typeof routeModule === "function") {
          routeModule(app);
        }
      } catch (err) {
        console.error(chalk.red(`Error loading ${baseName}:`), err.message);
      }
    }
  }
}

loadAllEndpoints(apiFolder);

console.log(chalk.bgHex('#90EE90').hex('#333').bold(' Load Complete! ✓ '));
console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Total Routes Loaded: ${totalRoutes} `));

global.rawEndpoints = rawEndpoints;

app.get('/api/data', (req, res) => {
  const endpoints = {
    categories: Object.keys(rawEndpoints)
      .sort((a, b) => a.localeCompare(b))
      .map(category => ({
        name: category,
        items: rawEndpoints[category]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(endpoint => ({
            name: endpoint.name,
            method: endpoint.method || 'GET',
            path: endpoint.path,
            description: endpoint.description || endpoint.desc,
            parameters: endpoint.parameters || {}
          }))
      }))
  };
  
  res.json({
    success: true,
    data: endpoints,
    message: `Loaded ${totalRoutes} endpoints`
  });
});

app.get('/settings', (req, res) => {
  const endpoints = {
    categories: Object.keys(rawEndpoints)
      .sort((a, b) => a.localeCompare(b))
      .map(category => ({
        name: category,
        items: rawEndpoints[category]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(endpoint => ({
            name: endpoint.name,
            method: endpoint.method || 'GET',
            path: endpoint.path,
            description: endpoint.description || endpoint.desc,
            parameters: endpoint.parameters || {}
          }))
      }))
  };
  
  const fullSettings = {
    ...settings,
    categories: endpoints.categories,
    metadata: {
      totalEndpoints: totalRoutes,
      totalCategories: endpoints.categories.length,
      lastUpdated: new Date().toISOString()
    }
  };
  
  res.json(fullSettings);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/home.html'));
});

app.get('/api-reference', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/api-reference.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/docs.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: totalRoutes
  });
});

app.listen(PORT, () => {
  console.log(chalk.bgHex('#90EE90').hex('#333').bold(` Server is running on port ${PORT} `));
  console.log(chalk.cyan(`  Documentation: http://localhost:${PORT}`));
  console.log(chalk.cyan(`  Settings API: http://localhost:${PORT}/settings`));
  console.log(chalk.cyan(`  Data API: http://localhost:${PORT}/api/data`));
});

module.exports = app;
