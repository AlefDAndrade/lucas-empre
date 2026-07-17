// ─── test/paletes-ordem-round-trip.test.js ──────────────────────────────────
// Testa a ORDEM DOS PALETES de ponta a ponta (Configurações → Paletes →
// "Ordem dos Paletes", ver public/js/paletes-ordem.js) — ver conversa que
// motivou a mudança: o usuário reportou que a ordem configurada não
// aparecia no Setor de Qualidade nem depois de F5. Este teste reproduz o
// cenário real: salva uma ordem CUSTOMIZADA (diferente do default) via
// POST /salvar-config (mesma rota que a UI usa), depois abre a página do
// zero (equivalente a um F5 de verdade) e confere se a ordem aplicada nos
// 4 paletes do Setor de Qualidade é a customizada, não o default
// (stack2=1, stack1=2, stack3=3, stack4=4).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const { iniciarServidorDeTeste } = require('./helpers/servidor-teste.js');

const SENHA_ADMIN = 'senha-admin-paletes-ordem-round-159';
const HASH_ADMIN = crypto.createHash('sha256').update(SENHA_ADMIN, 'utf8').digest('hex');

// Permutação DIFERENTE do default ({stack1:2,stack2:1,stack3:3,stack4:4})
// em TODAS as 4 posições — se o teste passar com este mapa, não tem como
// ser coincidência com o default.
const ORDEM_CUSTOM = { stack1: 4, stack2: 3, stack3: 1, stack4: 2 };

let servidor;

before(async () => {
  servidor = await iniciarServidorDeTeste({
    seedSecurityJson: { passwordHash: HASH_ADMIN, recoveryKeyHash: null },
  });
});

after(async () => {
  await servidor.parar();
});

function extrairCookie(resposta) {
  const setCookie = resposta.headers.get('set-cookie') || '';
  return setCookie.split(';')[0] || null;
}

test('POST /salvar-config com paletesOrdem customizado round-tripa corretamente em GET /db/config.json', async () => {
  const respLogin = await fetch(`${servidor.baseUrl}/verificar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: SENHA_ADMIN }),
  });
  const cookieAdmin = extrairCookie(respLogin);
  assert.ok(cookieAdmin, 'login de admin deveria ter funcionado');

  // Mesmo padrão de cfgSalvar() (app-core.js): busca o config.json ATUAL
  // primeiro, e só sobrescreve o campo paletesOrdem — /salvar-config
  // substitui o arquivo INTEIRO, então preservar o resto é obrigatório
  // pra não invalidar o teste com um payload artificialmente incompleto.
  const respAtual = await fetch(`${servidor.baseUrl}/db/config.json`);
  const cfgAtual = await respAtual.json();
  assert.notDeepEqual(cfgAtual.paletesOrdem, ORDEM_CUSTOM, 'sanity check: o default não pode ser igual ao que vamos testar');

  const respSalvar = await fetch(`${servidor.baseUrl}/salvar-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ ...cfgAtual, paletesOrdem: ORDEM_CUSTOM }),
  });
  assert.equal(respSalvar.status, 200);

  const respDepois = await fetch(`${servidor.baseUrl}/db/config.json`, { cache: 'no-store' });
  const cfgDepois = await respDepois.json();
  assert.deepEqual(cfgDepois.paletesOrdem, ORDEM_CUSTOM);
});

test('uma carga de página NOVA (equivalente a F5) aplica a ordem customizada nos 4 paletes do Setor de Qualidade', async () => {
  // A esta altura, config.json já tem ORDEM_CUSTOM salvo (teste anterior)
  // — abrir a página do ZERO agora é exatamente o que um F5 de verdade
  // faz: reexecuta loadConfig() from scratch, sem nenhum estado herdado
  // de JS anterior.
  const dom = await JSDOM.fromURL(`${servidor.baseUrl}/index.html`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.Chart = function () { this.destroy = () => {}; };
      win.HTMLElement.prototype.scrollIntoView = function () {};
      win.fetch = (url, opts) => {
        const absoluta = new URL(url, win.location.href).toString();
        return fetch(absoluta, opts);
      };
    },
  });
  const window = dom.window;
  const document = window.document;
  try {
    window.sessionStorage.setItem('lw_role', 'Administrador');
    window.localStorage.setItem('lw_admin_authenticated', 'true');
    await new Promise(r => setTimeout(r, 2500));
    window.showPage('setor-qualidade');
    await new Promise(r => setTimeout(r, 500));

    const cols = document.querySelectorAll('.sq-pallet-col[data-pallet-id]');
    assert.ok(cols.length === 4, 'deveria ter 4 paletes na tela do Setor de Qualidade');
    const ordens = {};
    cols.forEach(el => { ordens[el.dataset.palletId] = window.getComputedStyle(el).order; });

    assert.equal(ordens.stack1, String(ORDEM_CUSTOM.stack1), 'Pallet 1 não está na posição customizada salva');
    assert.equal(ordens.stack2, String(ORDEM_CUSTOM.stack2), 'Pallet 2 não está na posição customizada salva');
    assert.equal(ordens.stack3, String(ORDEM_CUSTOM.stack3), 'Pallet 3 não está na posição customizada salva');
    assert.equal(ordens.stack4, String(ORDEM_CUSTOM.stack4), 'Pallet 4 não está na posição customizada salva');
  } finally {
    dom.window.close();
  }
});
