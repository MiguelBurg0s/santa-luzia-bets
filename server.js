// Servidor local simples para desenvolvimento
// Corre com: node server.js
// Abre: http://localhost:3000

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  // Servir ficheiros estaticos
  const filePath = path.join(__dirname, url);
  const ext      = path.extname(filePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA fallback: servir index.html para rotas desconhecidas
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
}).listen(PORT, () => {
  console.log(`\n✅ Santa Luzia Bets a correr em http://localhost:${PORT}\n`);
  console.log('   Ctrl+C para parar\n');
});
