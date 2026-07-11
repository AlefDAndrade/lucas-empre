// ─── test/setor-qualidade-espelho-bateria-dinamica.test.js ──────────────────
// Regressão de um bug real: sq-batteryId é um <select> com só 13 <option>s
// FIXAS no HTML (ver public/partials/page-setor-qualidade.html), mas o
// cadastro de baterias é dinâmico (LW.BATERIA_IDS, configurável em Registro
// de Baterias) — uma avaliação já registrada pode ter um batteryId que não
// está entre essas 13 opções (bateria nova, cadastrada depois do HTML ter
// sido escrito, ou convenção de nome divergente).
//
// Antes da correção, _carregarAvaliacaoNoFormulario fazia
// `document.getElementById('sq-batteryId').value = item.batteryId` direto:
// quando esse valor não batia com nenhuma <option>, o navegador ignorava a
// atribuição em silêncio — o campo ficava vazio, e "Editar" no Espelho Visual
// abria a correção sem o ID da bateria, impossibilitando salvar (
// registerEvaluation recusa registrar sem esse campo preenchido).
//
// Ver também test/setor-qualidade-trava.test.js — mesmo harness, mas a
// AVALIACAO_REGISTRADA de lá usa 'B7', que já existe entre as <option>s
// fixas, então não reproduz este bug (por isso este arquivo usa uma bateria
// própria, fora da lista).

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { montarTela, tick } = require('./helpers/setor-qualidade-dom.js');

// Bateria cadastrada dinamicamente (ex: adicionada depois em "Registro de
// Baterias"), fora das 13 <option>s hardcoded no HTML.
const AVALIACAO_BATERIA_DINAMICA = {
  id: 'av-dinamica-1',
  batteryId: 'B14',
  turno: '1° TURNO',
  tempInput: '38°C',
  dtMontagem: '2026-07-01T10:00:00.000Z',
  dtEnchimento: '2026-07-01T10:30:00.000Z',
  dtDesmoldagem: '2026-07-01T12:00:00.000Z',
  observations: 'avaliação com bateria fora da lista fixa do select',
  montagem: { pallet1: 'SP', pallet2: 'SP', pallet3: 'SP', pallet4: 'SP' },
  totalSlabs: 40,
  dimensaoOperacao: 9,
  registeredAt: '2026-07-01T12:05:00.000Z',
  linkedOperacaoId: 'op-dinamica-1',
  paineis: [],
};

let dom;

beforeEach(() => {
  dom = montarTela({ avaliacoesRegistradas: [AVALIACAO_BATERIA_DINAMICA] });
});

after(() => {
  dom = null;
});

test('editar pelo Espelho uma avaliação com bateria fora das <option>s fixas preenche o ID da bateria (não perde o valor)', async () => {
  const { window } = dom;
  window.sessionStorage.setItem('lw_role', 'Administrador');

  window.SQ.navigateTo('dashboard');
  await tick(10); // espera carregarAvaliacoesQualidade() (fetch mockado) popular dashboardEvals

  const sel = window.document.getElementById('sq-batteryId');
  // Confirma a premissa do teste: 'B14' realmente não existe entre as
  // <option>s fixas do HTML antes de editar.
  assert.equal(
    Array.from(sel.options).some(o => o.value === 'B14'),
    false,
    'premissa do teste: B14 não deveria existir entre as <option>s fixas do HTML'
  );

  window.SQ.editarAvaliacaoDoEspelho(); // abre o modal de confirmação
  const modalOk = window.document.getElementById('sq-modal-ok');
  assert.ok(modalOk.onclick, 'o modal de confirmação deveria estar aberto com o botão OK pronto');
  modalOk.onclick(); // simula o clique em "Confirmar"
  await tick();

  // O bug: antes da correção, este .value ficava vazio (ou preso na
  // primeira <option>, 'B1') em vez de 'B14'.
  assert.equal(sel.value, 'B14', 'o ID da bateria não pode sumir ao editar via Espelho');
  assert.equal(
    Array.from(sel.options).some(o => o.value === 'B14'),
    true,
    'a <option> para B14 deveria ter sido injetada dinamicamente'
  );
});

test('depois de editar pelo Espelho uma bateria fora da lista fixa, dá pra salvar a correção (registerEvaluation não recusa por falta de ID)', async () => {
  const { window } = dom;
  window.sessionStorage.setItem('lw_role', 'Administrador');

  window.SQ.navigateTo('dashboard');
  await tick(10);

  window.SQ.editarAvaliacaoDoEspelho();
  window.document.getElementById('sq-modal-ok').onclick();
  await tick();

  // Sem o fix, o alerta "Selecione o ID da Bateria." dispararia aqui porque
  // sq-batteryId.value estaria vazio — capturamos showAlert pra confirmar
  // que esse bloqueio específico não é mais acionado.
  const alertas = [];
  const LwOriginal = window.LW;
  window.LW = { ...LwOriginal, mostrarAlerta: (msg) => alertas.push(msg) };

  window.SQ.registerEvaluation();
  await tick();

  assert.ok(
    !alertas.some(msg => /Selecione o ID da Bateria/i.test(msg)),
    'registerEvaluation não deveria recusar por falta de ID de bateria depois de editar via Espelho'
  );

  window.LW = LwOriginal;
});
