const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.key':  'text/plain',
};

http.createServer((req, res) => {

  // Extrai apenas o caminho (pathname) da URL, ignorando parâmetros como ?_=...
  const [urlPath] = req.url.split('?');

  // Salvar config.json via POST
  if (req.method === 'POST' && urlPath === '/salvar-config') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const cfg = JSON.parse(body);
        fs.writeFileSync(path.join(DIR, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // Salvar security.json via POST
  if (req.method === 'POST' && urlPath === '/salvar-security') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const hexRE = /^[0-9a-f]{64}$/;
        if (
          typeof payload.passwordHash    !== 'string' || !hexRE.test(payload.passwordHash) ||
          typeof payload.recoveryKeyHash !== 'string' || !hexRE.test(payload.recoveryKeyHash)
        ) {
          throw new Error('Payload inválido: hashes SHA-256 esperados.');
        }
        const securityPath = path.join(DIR, 'security.json');
        fs.writeFileSync(securityPath, JSON.stringify({
          passwordHash:    payload.passwordHash,
          recoveryKeyHash: payload.recoveryKeyHash,
        }, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // Registrar operação — faz append no historico.json
  if (req.method === 'POST' && urlPath === '/registrar-operacao') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const record = JSON.parse(body);
        const historicoPath = path.join(DIR, 'historico.json');
        let historico = [];
        try {
          historico = JSON.parse(fs.readFileSync(historicoPath, 'utf8'));
        } catch (_) {}
        historico.push(record);
        fs.writeFileSync(historicoPath, JSON.stringify(historico, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // Registrar linhas do relatório de injeção — append em relatorio_injecao.json
 if (req.method === 'POST' && urlPath === '/registrar-relatorio-injecao') {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const dadosRecebidos = JSON.parse(body); // Array de traços enviados pelo frontend
      const relatorioPath = path.join(DIR, 'relatorio_injecao.json');
      
      let relatorio = [];
      try { 
        relatorio = JSON.parse(fs.readFileSync(relatorioPath, 'utf8')); 
      } catch(_) {
        relatorio = [];
      }

      dadosRecebidos.forEach(novoTraco => {
        // Tenta encontrar o traço já existente no arquivo pelo ID único
        console.log('recebido:', novoTraco.id_traco);
        const registroExistente = relatorio.find(r => r.id_traco === novoTraco.id_traco);

        if (registroExistente) {
          // SE JÁ EXISTE: Apenas adiciona a nova operação ao array 'operacao'
          if (!registroExistente.ultilizado) registroExistente.ultilizado = { operacao: [] };
          
          // Adiciona os dados da nova utilização (id_operacao, bateria, berços)
          registroExistente.ultilizado.operacao.push(...novoTraco.ultilizado.operacao);
          
          // Opcional: Atualiza a observação se o operador escreveu algo novo na segunda utilização
          if (novoTraco.obs) {
            registroExistente.obs = registroExistente.obs 
              ? registroExistente.obs + " | " + novoTraco.obs 
              : novoTraco.obs;
          }
        } else {
          // SE NÃO EXISTE: É um traço novo, adiciona ele inteiro ao relatório
          relatorio.push(novoTraco);
        }
      });

      // Salva o arquivo atualizado
      fs.writeFileSync(relatorioPath, JSON.stringify(relatorio, null, 2), 'utf8');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, erro: e.message }));
    }
  });
  return;
}

  // Importar lote de relatório de injeção — merge com deduplicação
  if (req.method === 'POST' && urlPath === '/importar-relatorio-injecao') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const novos = JSON.parse(body);
        if (!Array.isArray(novos)) throw new Error('Payload deve ser um array');
        const relatorioPath = path.join(DIR, 'relatorio_injecao.json');
        let relatorio = [];
        try { relatorio = JSON.parse(fs.readFileSync(relatorioPath, 'utf8')); } catch(_) {}
        const existentes = new Set(relatorio.map(r => r.id_operacao + '|' + r.num_traco));
        let inseridos = 0, duplicatas = 0;
        novos.forEach(r => {
          const chave = r.id_operacao + '|' + r.num_traco;
          if (existentes.has(chave)) { duplicatas++; }
          else { relatorio.push(r); existentes.add(chave); inseridos++; }
        });
        relatorio.sort((a, b) => (a.data > b.data ? 1 : -1));
        fs.writeFileSync(relatorioPath, JSON.stringify(relatorio, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, inseridos, duplicatas }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // Importar lote de registros — merge no historico.json com deduplicação
  if (req.method === 'POST' && urlPath === '/importar-historico') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const novos = JSON.parse(body);
        if (!Array.isArray(novos)) throw new Error('Payload deve ser um array');
        const historicoPath = path.join(DIR, 'historico.json');
        let historico = [];
        try { historico = JSON.parse(fs.readFileSync(historicoPath, 'utf8')); } catch(_) {}
        const existentes = new Set(historico.map(r => r.id || (r.data + '|' + r.id_bateria + '|' + r.turno)));
        let inseridos = 0, duplicatas = 0;
        novos.forEach(r => {
          const chave = r.id || (r.data + '|' + r.id_bateria + '|' + r.turno);
          if (existentes.has(chave)) { duplicatas++; }
          else { historico.push(r); existentes.add(chave); inseridos++; }
        });
        historico.sort((a, b) => (a.data > b.data ? 1 : -1));
        fs.writeFileSync(historicoPath, JSON.stringify(historico, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, inseridos, duplicatas }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // ── SOBRA: Salvar sobra.json ──────────────────────────────────────────────
  // POST /salvar-sobra  { ativa, tracoId, operacaoOrigem, flow, densidade, receita, data, ... }
  if (req.method === 'POST' && urlPath === '/salvar-sobra') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const sobra = JSON.parse(body);
        const sobraPath = path.join(DIR, 'sobra.json');
        fs.writeFileSync(sobraPath, JSON.stringify(sobra, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, erro: e.message }));
      }
    });
    return;
  }

  // Servir arquivos estáticos normalmente
  let filePath = path.join(DIR, urlPath === '/' ? 'login.html' : urlPath);
  const ext = path.extname(filePath);
  if (!MIME[ext] && !ext) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });

}).listen(PORT, () => {
  console.log(`Lightwall rodando em http://localhost:${PORT}`);
});
