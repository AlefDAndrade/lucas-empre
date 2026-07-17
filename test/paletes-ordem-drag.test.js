// ─── test/paletes-ordem-drag.test.js ────────────────────────────────────────
// Testa "Ordem dos Paletes" (Configurações → Paletes — ver
// public/js/paletes-ordem.js) dirigindo o MESMO caminho que um Administrador
// de verdade usa: abrir Configurações, arrastar (poIniciarArrastar/poSoltar
// — simulados aqui com um dataTransfer falso, já que jsdom não implementa
// drag-and-drop de verdade), clicar "✓ Salvar Configurações" (cfgSalvar),
// e conferir se o que foi arrastado é exatamente o que chega em
// config.json — ver conversa que motivou a mudança: o usuário reportou que
// a ordem configurada não pegava nem com F5.
//
// Mesmo padrão de test/paletes-config.test.js (equivalente pra "Definir
// Paletes"): servidor HTTP real + Admin Master autenticado + AdminAuth
// stubado.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const { iniciarServidorDeTeste } = require('./helpers/servidor-teste.js');

const SENHA_ADMIN = 'senha-admin-paletes-ordem-drag-753';
const HASH_ADMIN = crypto.createHash('sha256').update(SENHA_ADMIN, 'utf8').digest('hex');

let servidor;
let dom;
let window;
let document;

before(async () => {
  servidor = await iniciarServidorDeTeste({
    seedSecurityJson: { passwordHash: HASH_ADMIN, recoveryKeyHash: null },
  });
  const respAdmin = await fetch(`${servidor.baseUrl}/verificar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: SENHA_ADMIN }),
  });
  const cookieAdmin = (respAdmin.headers.get('set-cookie') || '').split(';')[0];

  dom = await JSDOM.fromURL(servidor.baseUrl + '/index.html', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.Chart = function () { this.destroy = () => {}; };
      win.Element.prototype.scrollIntoView = function () {};
      win.fetch = (url, opts) => {
        const absoluta = new URL(url, win.location.href).toString();
        const headers = { ...(opts && opts.headers), Cookie: cookieAdmin };
        return fetch(absoluta, { ...opts, headers });
      };
    },
  });
  window = dom.window;
  document = window.document;
  window.sessionStorage.setItem('lw_role', 'Administrador');
  await new Promise(r => setTimeout(r, 2500));
  window.eval('AdminAuth.abrirModal = function(onSuccess) { if (onSuccess) onSuccess(); };');
});

after(async () => {
  if (dom && dom.window) dom.window.close();
  await servidor.parar();
});

// jsdom não implementa DataTransfer/drag-and-drop de verdade — um objeto
// mínimo com só os 2 métodos que poIniciarArrastar/poSoltar de fato usam
// (setData/getData) já é suficiente pra exercitar a lógica real deles.
function fakeDataTransfer() {
  const dados = {};
  return { setData: (tipo, valor) => { dados[tipo] = valor; }, getData: (tipo) => dados[tipo] };
}

function arrastarESoltar(sidOrigem, sidDestino) {
  const dt = fakeDataTransfer();
  window.poIniciarArrastar({ dataTransfer: dt }, sidOrigem);
  const colDestino = document.querySelector(`.po-pallet-col[data-pallet-id="${sidDestino}"]`);
  window.poSoltar({ preventDefault: () => {}, currentTarget: colDestino, dataTransfer: dt }, sidDestino);
}

test('abrir Configurações renderiza a grade de "Ordem dos Paletes" já com o default', () => {
  window.abrirConfig();
  window.cfgMostrarSecao('paletes');
  const cols = document.querySelectorAll('.po-pallet-col[data-pallet-id]');
  assert.equal(cols.length, 4, 'deveria ter os 4 paletes na grade de Ordem dos Paletes');

  const rascunho = window.eval('_poRascunho');
  const def = window.eval('LW.PALETES_ORDEM_DEFAULT');
  assert.deepEqual(rascunho, def, 'rascunho deveria nascer igual ao default (config.json ainda sem "paletesOrdem")');
});

test('arrastar PALETE 1 pra cima de PALETE 2 troca os dois no rascunho (_poRascunho) e no DOM (style.order)', () => {
  const def = window.eval('LW.PALETES_ORDEM_DEFAULT');

  arrastarESoltar('stack1', 'stack2');

  const rascunho = window.eval('_poRascunho');
  assert.equal(rascunho.stack1, def.stack2, 'stack1 deveria ter assumido a posição que era do stack2');
  assert.equal(rascunho.stack2, def.stack1, 'stack2 deveria ter assumido a posição que era do stack1');
  assert.equal(rascunho.stack3, def.stack3, 'stack3 não deveria ter mudado');
  assert.equal(rascunho.stack4, def.stack4, 'stack4 não deveria ter mudado');

  const colStack1 = document.querySelector('.po-pallet-col[data-pallet-id="stack1"]');
  const colStack2 = document.querySelector('.po-pallet-col[data-pallet-id="stack2"]');
  assert.equal(colStack1.style.order, String(def.stack2), 'DOM: style.order de stack1 deveria refletir a troca');
  assert.equal(colStack2.style.order, String(def.stack1), 'DOM: style.order de stack2 deveria refletir a troca');
});

test('poColetarValores() devolve exatamente o rascunho arrastado', () => {
  const rascunho = window.eval('_poRascunho');
  const coletado = window.poColetarValores();
  assert.deepEqual(coletado, rascunho);
});

test('clicar "✓ Salvar Configurações" persiste a ordem arrastada em config.json de verdade', async () => {
  // Extrai valores PRIMITIVOS do objeto (não o objeto em si) — _poRascunho
  // vive no realm do jsdom; comparar o objeto inteiro via deepEqual contra
  // um objeto do realm do Node (vindo de JSON.parse) falsamente acusaria
  // diferença só por causa do protótipo, mesmo com os mesmos valores.
  const rascunhoAntes = window.eval('_poRascunho');
  const esperado = {
    stack1: rascunhoAntes.stack1, stack2: rascunhoAntes.stack2,
    stack3: rascunhoAntes.stack3, stack4: rascunhoAntes.stack4,
  };

  const promessaSalvar = window.cfgSalvar();
  // cfgSalvar() mostra um alerta de sucesso que espera um clique real
  // antes de seguir pro reload — mesmo padrão de test/paletes-config.test.js.
  await new Promise(r => setTimeout(r, 400));
  const btnOk = document.getElementById('btn-alerta-ok');
  if (btnOk) btnOk.click();
  await promessaSalvar;
  await new Promise(r => setTimeout(r, 300));

  const resp = await fetch(`${servidor.baseUrl}/db/config.json`, { cache: 'no-store' });
  const cfgSalvo = await resp.json();
  assert.deepEqual(cfgSalvo.paletesOrdem, esperado, 'config.json deveria ter persistido a ordem arrastada, não o default');
});

test('depois de recarregar a página (F5 real), a ordem arrastada continua aplicada nos 4 paletes do Setor de Qualidade', async () => {
  const esperado = (await (await fetch(`${servidor.baseUrl}/db/config.json`, { cache: 'no-store' })).json()).paletesOrdem;

  const respAdmin = await fetch(`${servidor.baseUrl}/verificar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: SENHA_ADMIN }),
  });
  const cookie = (respAdmin.headers.get('set-cookie') || '').split(';')[0];

  const dom2 = await JSDOM.fromURL(servidor.baseUrl + '/index.html', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(win) {
      win.Chart = function () { this.destroy = () => {}; };
      win.Element.prototype.scrollIntoView = function () {};
      win.fetch = (url, opts) => {
        const absoluta = new URL(url, win.location.href).toString();
        const headers = { ...(opts && opts.headers), Cookie: cookie };
        return fetch(absoluta, { ...opts, headers });
      };
    },
  });
  try {
    const window2 = dom2.window;
    window2.sessionStorage.setItem('lw_role', 'Administrador');
    await new Promise(r => setTimeout(r, 2500));
    window2.showPage('setor-qualidade');
    await new Promise(r => setTimeout(r, 500));

    const cols = window2.document.querySelectorAll('.sq-pallet-col[data-pallet-id]');
    const ordens = {};
    cols.forEach(el => { ordens[el.dataset.palletId] = window2.getComputedStyle(el).order; });

    assert.equal(ordens.stack1, String(esperado.stack1));
    assert.equal(ordens.stack2, String(esperado.stack2));
    assert.equal(ordens.stack3, String(esperado.stack3));
    assert.equal(ordens.stack4, String(esperado.stack4));
  } finally {
    dom2.window.close();
  }
});
