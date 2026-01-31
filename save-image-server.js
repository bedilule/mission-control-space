// Simple local server to save images to the filesystem
// Run with: node save-image-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const SHIPS_DIR = path.join(__dirname, 'public', 'ships');
const PLANETS_DIR = path.join(__dirname, 'public', 'planets');

// Ensure directories exist
if (!fs.existsSync(SHIPS_DIR)) fs.mkdirSync(SHIPS_DIR, { recursive: true });
if (!fs.existsSync(PLANETS_DIR)) fs.mkdirSync(PLANETS_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/save-image') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { base64, type, userId, name } = JSON.parse(body);

        // Extract base64 data (remove data:image/png;base64, prefix)
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Generate filename
        const timestamp = Date.now();
        const safeName = (name || 'image').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const filename = `${userId || 'unknown'}-${safeName}-${timestamp}.png`;

        // Choose directory based on type
        const dir = type === 'planet' ? PLANETS_DIR : SHIPS_DIR;
        const filepath = path.join(dir, filename);

        // Save file
        fs.writeFileSync(filepath, buffer);

        // Return the path relative to public folder
        const relativePath = type === 'planet'
          ? `/planets/${filename}`
          : `/ships/${filename}`;

        console.log(`✅ Saved: ${filepath}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          path: relativePath,
          fullPath: filepath
        }));
      } catch (err) {
        console.error('❌ Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Image save server running on http://localhost:${PORT}`);
  console.log(`📁 Ships will be saved to: ${SHIPS_DIR}`);
  console.log(`📁 Planets will be saved to: ${PLANETS_DIR}\n`);
});
