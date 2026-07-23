const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3003;
const FILE_PATH = path.join(__dirname, '..', 'crm_layout_db.json');

// Generate or read the secure token
let mapperToken = '';
try {
  const tokenFile = path.join(__dirname, '..', '.crazy_token');
  if (fs.existsSync(tokenFile)) {
    mapperToken = fs.readFileSync(tokenFile, 'utf8').trim();
  } else {
    mapperToken = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenFile, mapperToken, 'utf8');
  }
} catch(e) {
  mapperToken = crypto.randomBytes(32).toString('hex');
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mapper-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const origin = req.headers.origin || '';

  // Return the token only if requested by the extension background/popup
  if (req.method === 'GET' && req.url === '/get-token') {
    if (origin.startsWith('chrome-extension://')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: mapperToken }));
    } else {
      res.writeHead(403);
      res.end('Forbidden');
    }
    return;
  }

  // Token authentication for all layout/error logs sync requests
  const requestToken = req.headers['x-mapper-token'] || '';
  if (req.method === 'POST') {
    if (requestToken !== mapperToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid token' }));
      return;
    }
  }

  if (req.method === 'POST' && req.url === '/save-layout') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        let db = {};
        try {
          await fs.promises.access(FILE_PATH);
          try {
            db = JSON.parse(await fs.promises.readFile(FILE_PATH, 'utf8'));
          } catch (e) {
            db = {};
          }
        } catch (e) {
          // Arquivo não existe
        }

        const routeKey = data.route.split('?')[0] || '/';
        
        // Mapeia a rota para um nome de arquivo amigável e setorizado
        let fileName = 'layout_general.json';
        const routeLower = routeKey.toLowerCase();
        
        if (routeLower.includes('dashboard')) {
          fileName = 'layout_dashboard.json';
        } else if (routeLower.includes('multiservice') || routeLower.includes('chat') || routeLower.includes('atendimento') || routeLower.includes('conversa')) {
          fileName = 'layout_chat.json';
        } else if (routeLower.includes('lead')) {
          fileName = 'layout_leads.json';
        } else if (routeLower.includes('automation') || routeLower.includes('fluxo')) {
          fileName = 'layout_automation.json';
        } else if (routeLower.includes('connection') || routeLower.includes('conex') || routeLower.includes('channel') || routeLower.includes('canal')) {
          fileName = 'layout_connections.json';
        } else if (routeLower.includes('pipe') || routeLower.includes('kanban') || routeLower.includes('quadro') || routeLower.includes('board') || routeLower.includes('negocio')) {
          fileName = 'layout_pipeline.json';
        } else {
          // Fallback para outras rotas (ex: /config -> layout_config.json)
          const cleanName = routeKey.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
          fileName = `layout_${cleanName || 'general'}.json`;
        }

        const filePath = path.resolve(path.join(__dirname, '..', fileName));
        const expectedDir = path.resolve(path.join(__dirname, '..'));
        
        if (!filePath.startsWith(expectedDir)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Request: Path Traversal Detected' }));
          return;
        }

        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`[CrazyLayoutMapper] Setorizado: Gravado em "${fileName}" para a tela "${data.title}"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Falha ao gravar arquivo de layout:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/save-error') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const errorData = JSON.parse(body);
        const filePath = path.join(__dirname, '..', 'captured_errors.json');
        
        let errorsList = [];
        try {
          await fs.promises.access(filePath);
          try {
            errorsList = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
            if (!Array.isArray(errorsList)) errorsList = [];
          } catch (e) {
            errorsList = [];
          }
        } catch (e) {
          // Arquivo não existe
        }
        
        if (!errorData.timestamp) {
          errorData.timestamp = new Date().toISOString();
        }
        
        errorsList.unshift(errorData);
        if (errorsList.length > 200) {
          errorsList = errorsList.slice(0, 200);
        }
        
        await fs.promises.writeFile(filePath, JSON.stringify(errorsList, null, 2));
        console.log(`[CrazyLayoutMapper] Diagnóstico: Gravado erro "${errorData.type || 'DESCONHECIDO'}" em "captured_errors.json"`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Falha ao gravar arquivo de erro:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n===================================================================');
  console.log(`🚀 [CrazyLayoutMapper] Servidor rodando em http://127.0.0.1:${PORT}`);
  console.log(`📝 [CrazyLayoutMapper] Gravando snapshots na pasta raiz`);
  console.log('Navegue pelo CRM normalmente; o arquivo será atualizado em tempo real!');
  console.log('===================================================================\n');
});
