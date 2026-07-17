// ─── test/paletes-ordem-race-condition.test.js ──────────────────────────────
// Reproduz a causa raiz de verdade do bug relatado ("preciso sair e entrar
// de novo pro perfil pra ordem aparecer certa"): antes desta correção,
// _aplicarOrdemPaletes() (setor-qualidade.js) lia LW.PALETES_ORDEM
// IMEDIATAMENTE, sem esperar loadConfig() (data.js — um fetch assíncrono)
// terminar. Como SQ.init() só roda 1 VEZ por sessão (guardado por
// window._sqInit, ver app-core.js), se isso acontecesse ANTES do config
// carregar, a ordem errada (default) ficava aplicada e PRESA até uma
// sessão nova — só um logout+login (que dá mais tempo antes da pessoa
// clicar em Setor de Qualidade) coincidentemente "consertava".
//
// A correção usa LW.waitConfig() (já existia em data.js, nunca tinha sido
// usado em lugar nenhum) — este teste simula "config ainda não carregou"
// manipulando o estado interno diretamente (_configReady/_configCallbacks,
// data.js) e confere que _aplicarOrdemPaletes() ESPERA em vez de aplicar
// na hora com um valor errado.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { JSDOM } = require('jsdom');
const { iniciarServidorDeTeste } = require('./helpers/servidor-teste.js');

const SENHA_ADMIN = 'senha-admin-paletes-race-951';
const HASH_ADMIN = crypto.createHash('sha256').update(SENHA_ADMIN, 'utf8').digest('hex');

let servidor, dom, window, document;

before(async () => {
  servidor = await iniciarServidorDeTeste({
    seedSecurityJson: { passwordHash: HASH_ADMIN, recoveryKeyHash: null },
  });
  dom = await JSDOM.fromURL(`${servidor.baseUrl}/index.html`, {
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
  window = dom.window;
  document = window.document;
  window.sessionStorage.setItem('lw_role', 'Administrador');
  window.localStorage.setItem('lw_admin_authenticated', 'true');
  await new Promise(r => setTimeout(r, 2500)); // boot completo, config já carregado de verdade
});

after(async () => {
  if (dom && dom.window) dom.window.close();
  await servidor.parar();
});

test('LW.waitConfig() existe e está disponível (pré-requisito da correção)', () => {
  assert.equal(typeof window.LW.waitConfig, 'function');
});

test('_aplicarOrdemPaletes() (via SQ.aplicarOrdemPaletes) NÃO aplica nada enquanto o config "ainda não carregou" — espera, não usa o default direto', () => {
  // Simula "config ainda não terminou de carregar" mexendo direto no
  // estado interno de data.js (_configReady/_configCallbacks, ambos
  // alcançáveis via eval no MESMO escopo global do script, já que são
  // `let` de nível de arquivo, não módulo — mesmo mecanismo que os
  // outros testes de paletes já usam pra ler _poRascunho/_pcRascunho).
  window.eval('_configReady = false; _configCallbacks.length = 0;');

  // Zera a posição visual dos 4 pallets pra um valor "impossível" (0) —
  // se _aplicarOrdemPaletes() aplicar ALGO nesse instante (bug antigo:
  // lia LW.PALETES_ORDEM direto, que ainda existe em memória mesmo com
  // _configReady=false, e sobrescrevia com o default), o teste abaixo
  // pega a mudança. Com a correção (LW.waitConfig), nada deveria mudar
  // agora — só depois que a gente "liberar" o config, no próximo teste.
  document.querySelectorAll('.sq-pallet-col[data-pallet-id]').forEach(el => { el.style.order = '0'; });

  window.SQ.aplicarOrdemPaletes();

  const ordens = {};
  document.querySelectorAll('.sq-pallet-col[data-pallet-id]').forEach(el => { ordens[el.dataset.palletId] = el.style.order; });
  assert.deepEqual(ordens, { stack1: '0', stack2: '0', stack3: '0', stack4: '0' },
    'com _configReady=false, aplicarOrdemPaletes() não deveria ter mudado nada ainda (deveria estar esperando via waitConfig)');
});

test('assim que o config "termina de carregar" (_configReady vira true), a chamada pendente aplica a ordem certa', () => {
  // "Libera" o config — mesmo mecanismo que loadConfig() (data.js) usa
  // de verdade ao terminar: marca _configReady=true e dispara os
  // callbacks que ficaram esperando (ver _configCallbacks.forEach, perto
  // do fim de loadConfig()).
  window.eval('_configReady = true; _configCallbacks.forEach(fn => fn()); _configCallbacks.length = 0;');

  const ordens = {};
  document.querySelectorAll('.sq-pallet-col[data-pallet-id]').forEach(el => { ordens[el.dataset.palletId] = window.getComputedStyle(el).order; });
  const esperado = window.eval('LW.PALETES_ORDEM');
  assert.equal(ordens.stack1, String(esperado.stack1));
  assert.equal(ordens.stack2, String(esperado.stack2));
  assert.equal(ordens.stack3, String(esperado.stack3));
  assert.equal(ordens.stack4, String(esperado.stack4));
});
