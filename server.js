import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Config Endpoint (returns environment API key if configured)
  if (req.url === '/api/config') {
    const key = process.env.GEMINI_API_KEY || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasEnvKey: Boolean(key && key.length > 10),
      geminiApiKey: key
    }));
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = fs.existsSync(path.join(__dirname, 'index.html')) ? '/index.html' : '/public/index.html';
  } else if (!fs.existsSync(path.join(__dirname, reqPath))) {
    if (fs.existsSync(path.join(__dirname, 'public', reqPath))) {
      reqPath = '/public' + reqPath;
    }
  }

  const filePath = path.join(__dirname, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found: ' + reqPath);
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n===========================================================`);
  console.log(`  OmniVoice AI - Multilingual Personal Voice Assistant`);
  console.log(`  Speak. Understand. Act. (College Hackathon Project)`);
  console.log(`===========================================================`);
  console.log(`  [+] Local Server running at: http://localhost:${PORT}`);
  console.log(`  [+] Open in your browser (Chrome / Edge recommended)`);
  console.log(`  [+] Supported: English, Hindi / Hinglish, Punjabi`);
  console.log(`  [+] Matches Slide 2 Compound Example:`);
  console.log(`      "Spent 250 rupees on lunch and remind me to submit form"`);
  console.log(`===========================================================\n`);
});
