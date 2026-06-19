// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  data.js — Storage, constants, calculation logic
// ============================================================

'use strict';

// ---- Constants (fixas) ----

const TURNO_OPTS = ['1º TURNO', '2º TURNO', '3º TURNO'];
const M2_POR_PAINEL = 1.83;  // m² por painel (calculado da planilha original)
const LIMITE_INJECAO_MIN = 59;    // minutos limite antes de registrar atraso

// ---- Config dinâmica — carregada de config.json ----
// Defaults vazios; preenchidos por loadConfig()
let DIMENSAO_OPTS = [];
let MONTAGEM_OPTS = [];   // ['2/P', 'S/P', 'HÍBRIDA', ...]
let MONTAGEM_MAP = {};   // { label: { paineis_2p_por_berco, paineis_sp_por_berco } }
let BATERIA_IDS = [];
let VOLUME_POR_PLACA = []; // [{ label: 'S/P - 7,5 cm', volume: 0.1373 }, ...]

let _configReady = false;
const _configCallbacks = [];

/**
 * Extrai os componentes de painéis de uma opção de tipo de montagem,
 * de forma genérica — suporta qualquer quantidade de tipos (2p, sp, 3p, ...).
 * Uma chave é considerada um componente se terminar em "_por_berco".
 * Retorna: { porBerco: { '2p': 2, 'sp': 0, ... } }
 * O tipo (ex: '2p') é extraído do nome da chave: paineis_2p_por_berco -> '2p'.
 */
function extrairComponentesMontagem(opcao) {
  const porBerco = {};
  Object.keys(opcao || {}).forEach(chave => {
    const m = chave.match(/^paineis_(.+)_por_berco$/);
    if (m) {
      const tipo = m[1]; // ex: '2p', 'sp', '3p'
      porBerco[tipo] = Number(opcao[chave]) || 0;
    }
  });
  return { porBerco };
}

async function loadConfig() {
  if (_configReady) return;
  try {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('config.json não encontrado');
    const cfg = await res.json();

    // Se não houver chave 'dimensoes', extraímos das baterias (nova estrutura)
    if (Array.isArray(cfg.dimensoes?.opcoes)) {
      DIMENSAO_OPTS = cfg.dimensoes.opcoes.map(d => ({ label: d.label, bercos: d.bercos }));
    } else if (Array.isArray(cfg.baterias?.ids)) {
      const uniqueDims = new Map();
      cfg.baterias.ids.forEach(b => {
        if (b.label && b.bercos) {
          uniqueDims.set(b.label, b.bercos);
        }
      });
      DIMENSAO_OPTS = Array.from(uniqueDims.entries()).map(([label, bercos]) => ({ label, bercos }));
    } else if (!DIMENSAO_OPTS.length) {
      console.warn('[LW] config.json sem "dimensoes" nem "baterias.ids" válidos — usando fallback de dimensões.');
      DIMENSAO_OPTS = [
        { label: '7,5 cm', bercos: 22 },
        { label: '9 cm', bercos: 20 },
        { label: '12 cm', bercos: 18 },
      ];
    }

    // Cada bloco do config.json é lido de forma independente: se um bloco vier
    // ausente ou malformado (ex: um campo esquecido ao salvar configurações),
    // isso não deve impedir a leitura dos demais blocos válidos. Cada bloco que
    // falhar mantém o valor já carregado (ou o default, na primeira carga).
    if (Array.isArray(cfg.tipos_montagem?.opcoes)) {
      MONTAGEM_OPTS = cfg.tipos_montagem.opcoes.map(t => t.label);
      MONTAGEM_MAP = {};
      cfg.tipos_montagem.opcoes.forEach(t => {
        MONTAGEM_MAP[t.label] = extrairComponentesMontagem(t);
      });
    } else if (!MONTAGEM_OPTS.length) {
      console.warn('[LW] config.json sem "tipos_montagem.opcoes" válido — usando fallback de tipos de montagem.');
      MONTAGEM_OPTS = ['2/P', 'S/P', 'HÍBRIDA'];
      MONTAGEM_MAP = {
        '2/P': { porBerco: { '2p': 2 } },
        'S/P': { porBerco: { 'sp': 2 } },
        'HÍBRIDA': { porBerco: { '2p': 1, 'sp': 1 } },
      };
    } else {
      console.warn('[LW] config.json sem "tipos_montagem.opcoes" válido — mantendo tipos de montagem já carregados.');
    }

    if (Array.isArray(cfg.baterias?.ids)) {
      BATERIA_IDS = cfg.baterias.ids;
    } else if (!BATERIA_IDS.length) {
      console.warn('[LW] config.json sem "baterias.ids" válido — usando fallback de baterias.');
      BATERIA_IDS = ['B1', 'B2', 'B3', 'B4', 'B5-7,5cm', 'B6-12cm', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12'];
    } else {
      console.warn('[LW] config.json sem "baterias.ids" válido — mantendo baterias já carregadas.');
    }

    if (Array.isArray(cfg.volume_por_placa)) {
      VOLUME_POR_PLACA = cfg.volume_por_placa.map(v => ({ label: v.label, volume: v.volume }));
    } else if (!VOLUME_POR_PLACA.length) {
      console.warn('[LW] config.json sem "volume_por_placa" válido — usando fallback (apenas informativo).');
      VOLUME_POR_PLACA = [
        { label: 'S/P - 7,5 cm', volume: 0.1373 },
        { label: '2/P - 7,5 cm', volume: 0.1189 },
        { label: 'S/P - 9 cm', volume: 0.1647 },
        { label: '2/P - 9 cm', volume: 0.1427 },
        { label: 'S/P - 12 cm', volume: 0.2196 },
        { label: '2/P - 12 cm', volume: 0.1903 },
      ];
    } else {
      console.warn('[LW] config.json sem "volume_por_placa" válido — mantendo lista já carregada.');
    }

  } catch (err) {
    console.warn('[LW] Usando valores fallback — config.json indisponível:', err.message);
    DIMENSAO_OPTS = [
      { label: '7,5 cm', bercos: 22 },
      { label: '9 cm', bercos: 20 },
      { label: '12 cm', bercos: 18 },
    ];
    MONTAGEM_OPTS = ['2/P', 'S/P', 'HÍBRIDA'];
    MONTAGEM_MAP = {
      '2/P': { porBerco: { '2p': 2 } },
      'S/P': { porBerco: { 'sp': 2 } },
      'HÍBRIDA': { porBerco: { '2p': 1, 'sp': 1 } },
    };
    BATERIA_IDS = ['B1', 'B2', 'B3', 'B4', 'B5-7,5cm', 'B6-12cm', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12'];
    VOLUME_POR_PLACA = [
      { label: 'S/P - 7,5 cm', volume: 0.1373 },
      { label: '2/P - 7,5 cm', volume: 0.1189 },
      { label: 'S/P - 9 cm', volume: 0.1647 },
      { label: '2/P - 9 cm', volume: 0.1427 },
      { label: 'S/P - 12 cm', volume: 0.2196 },
      { label: '2/P - 12 cm', volume: 0.1903 },
    ]
  }

  // Se o admin salvou uma config customizada, ela tem prioridade
  const override = localStorage.getItem('lw_config_override');
  if (override) {
    try {
      const cfg = JSON.parse(override);
      BATERIA_IDS = cfg.baterias.ids;
      DIMENSAO_OPTS = cfg.dimensoes.opcoes;
      MONTAGEM_OPTS = cfg.tipos_montagem.opcoes.map(t => t.label);
      MONTAGEM_MAP = {};
      cfg.tipos_montagem.opcoes.forEach(t => {
        MONTAGEM_MAP[t.label] = extrairComponentesMontagem(t);
      });
    } catch (e) { console.warn('Config override inválida', e); }
  }

  _configReady = true;
  _configCallbacks.forEach(fn => fn());
  _configCallbacks.length = 0;
}

/** Executa fn imediatamente se config já carregou, senão aguarda. */
function waitConfig(fn) {
  if (_configReady) { fn(); return; }
  _configCallbacks.push(fn);
}

// ---- LocalStorage helpers ----

const DB_KEY_OP_CURRENT = 'lw_op_current';

// Nota: DB_KEY_BATERIAS e DB_KEY_INJECOES foram descontinuados em favor de persistência no servidor.
// loadDB e saveDB foram removidos por falta de uso.

function getOperacaoAtual() {
  try {
    const raw = localStorage.getItem(DB_KEY_OP_CURRENT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveOperacaoAtual(op) {
  localStorage.setItem(DB_KEY_OP_CURRENT, JSON.stringify(op));
}

function clearOperacaoAtual() {
  localStorage.removeItem(DB_KEY_OP_CURRENT);
}

// ---- Calculation helpers ----

/**
 * Calcula painéis e m² para um tipo de montagem e quantidade de berços.
 * Suporta qualquer número de "tipos de placa" (2p, sp, 3p, ...), definidos
 * dinamicamente em MONTAGEM_MAP[tipoMontagem].porBerco.
 *
 * Retorna sempre:
 *  - paineis_por_tipo / m2_por_tipo: objetos { '2p': N, 'sp': N, ... } — fonte da verdade
 *  - paineis_2p, paineis_sp, m2_2p, m2_sp: aliases de compatibilidade com código/
 *    registros antigos que esperam exatamente esses dois tipos (sempre presentes,
 *    mesmo que valham 0, mesmo se o tipo não existir na montagem atual).
 */
function calcPaineis(tipoMontagem, bercos) {
  const map = MONTAGEM_MAP[tipoMontagem];
  const porBerco = (map && map.porBerco) ? map.porBerco : { 'sp': 2 }; // fallback histórico: S/P puro

  const paineis_por_tipo = {};
  let paineis_total = 0;
  Object.keys(porBerco).forEach(tipo => {
    const qtd = bercos * (porBerco[tipo] || 0);
    paineis_por_tipo[tipo] = qtd;
    paineis_total += qtd;
  });

  const m2_por_tipo = {};
  Object.keys(paineis_por_tipo).forEach(tipo => {
    m2_por_tipo[tipo] = paineis_por_tipo[tipo] * M2_POR_PAINEL;
  });
  const m2_total = paineis_total * M2_POR_PAINEL;

  // Placas cimenticia: regra de negócio específica do tipo '2p' (mantida).
  const placas_cimenticia = (paineis_por_tipo['2p'] || 0) * 2;

  return {
    total_paineis: paineis_total,
    m2_total,
    placas_cimenticia,
    paineis_por_tipo,
    m2_por_tipo,
    // Aliases de compatibilidade (sempre presentes):
    paineis_2p: paineis_por_tipo['2p'] || 0,
    paineis_sp: paineis_por_tipo['sp'] || 0,
    m2_2p: m2_por_tipo['2p'] || 0,
    m2_sp: m2_por_tipo['sp'] || 0,
  };
}

/**
 * Soma um campo do tipo { '2p': N, 'sp': N, ... } através de uma lista de registros.
 * Ex: somarPorTipo(baterias, 'paineis_por_tipo') -> { '2p': 120, 'sp': 40, '3p': 10 }
 */
function somarPorTipo(registros, campo) {
  const totais = {};
  registros.forEach(r => {
    const obj = r[campo];
    if (!obj) return;
    Object.keys(obj).forEach(tipo => {
      totais[tipo] = (totais[tipo] || 0) + (obj[tipo] || 0);
    });
  });
  return totais;
}

/**
 * Garante que um registro (do histórico, novo ou antigo) tenha paineis_por_tipo
 * e m2_por_tipo preenchidos, derivando-os dos campos legados paineis_2p/paineis_sp
 * quando necessário. Não sobrescreve dados já no formato novo.
 */
function normalizarPaineisRegistro(registro) {
  if (!registro) return registro;
  if (!registro.paineis_por_tipo) {
    registro.paineis_por_tipo = {
      '2p': registro.paineis_2p || 0,
      'sp': registro.paineis_sp || 0,
    };
  }
  if (!registro.m2_por_tipo) {
    registro.m2_por_tipo = {
      '2p': registro.m2_2p || 0,
      'sp': registro.m2_sp || 0,
    };
  }
  return registro;
}

// ---- Fuso horário padronizado: Brasília (America/Sao_Paulo) ----
// Use nowBrasilia() em vez de new Date() para capturar o momento atual.
// Retorna um Date cujo valor UTC é ajustado para representar "agora" em Brasília,
// garantindo que ISO strings e cálculos de duração sejam consistentes
// independentemente do fuso do computador do operador.
function nowBrasilia() {
  const now = new Date();
  // Obtém o offset real de Brasília no momento atual (considera horário de verão)
  const brFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = brFormatter.formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const brStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
  // Cria Date como se fosse UTC, representando a hora local de Brasília
  return new Date(brStr + 'Z');
}

// Retorna a data de hoje em Brasília no formato YYYY-MM-DD
function todayBrasilia() {
  return nowBrasilia().toISOString().split('T')[0];
}

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('pt-BR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    timeZone: 'UTC' 
  });
}

function diffMinutes(start, end) {
  const s = new Date(start), e = new Date(end);
  return (e - s) / 60000;
}

function formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return '—';
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

// ---- Seeder — import data from original spreadsheet ----
// Pre-load the historical records from the original xlsm into localStorage
// so dashboards show real data from day one.

// ---- Relatório de Injeção ----

async function registrarRelatorioInjecao(record) {
  const linhas = (record.tracos || []).map(t => ({
    id_traco: t.id || (record.id + '_t' + t.num),
    // Estrutura exata solicitada
    ultilizado: {
      operacao: [
        {
          id_operacao: record.id,
          id_bateria: record.id_bateria,
          berco_inicio: t.berco_ini || '',
          berco_finalizacao: t.berco_fim || ''
        }
      ]
    },
    data: record.data,
    turno: record.turno,
    num_traco: t.num,
    cimento_real: t.cimento_real || '',
    agua_real: t.agua_real || '',
    eps_real: t.eps_real || '',
    superplast_real: t.superplast_real || '',
    incorporador_real: t.incorporador_real || '',
    tempo_batida: t.tempo_batida || '',
    densidade: t.densidade_insumo || '',
    flow: t.flow_insumo || '',
    obs: t.obs || '',
    silo: t.silo || '',
    expansao: t.expansao || '',
    densidade_eps: t.densidadeEPS || '',
  }));

  if (!linhas.length) return;

  const res = await fetch('/registrar-relatorio-injecao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(linhas),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.erro || 'Erro ao registrar relatório de injeção');
}

async function getRelatorioInjecao() {
  try {
    const res = await fetch('relatorio_injecao.json');
    if (!res.ok) return [];
    return await res.json();
  } catch (_) { return []; }
}

/**
 * Obtém o total de traços já CONFIRMADOS hoje (Brasília) — apenas leitura,
 * não consome/incrementa nada. Usado para calcular a numeração de PRÉVIA
 * (total+1, total+2, ...) dos traços ainda em edição na operação atual.
 * O número só se torna definitivo quando a operação é finalizada — ver
 * confirmarTracosHoje().
 * @returns {Promise<number>} total de traços confirmados hoje
 */
async function getTotalTracosHoje() {
  const res = await fetch('/total-tracos-hoje?_=' + Date.now()); // evita cache
  const json = await res.json();
  if (!json.ok) throw new Error(json.erro || 'Erro ao obter total de traços do dia');
  return json.total;
}

/**
 * Confirma N traços ao finalizar uma operação — incrementa atomicamente o
 * total do dia no servidor. Deve ser chamada uma única vez por operação
 * finalizada, com a quantidade de traços que de fato sobraram (após exclusões).
 * Traços reaproveitados de sobra (mantêm Nº de uma operação anterior) NÃO
 * devem ser contados aqui — apenas traços novos desta operação.
 * @param {number} quantidade - quantos traços novos foram confirmados
 * @returns {Promise<number>} novo total acumulado do dia
 */
async function confirmarTracosHoje(quantidade) {
  const res = await fetch('/confirmar-tracos-hoje', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantidade }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.erro || 'Erro ao confirmar traços do dia');
  return json.total;
}

// ---- Analytics ----

async function registrarOperacao(record) {
  const res = await fetch('/registrar-operacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.erro || 'Erro ao registrar operação');
}

async function getStats(filtros = {}) {
  const baterias = await fetch('historico.json').then(r => r.json());
  // Garante paineis_por_tipo/m2_por_tipo em todos os registros (antigos e novos)
  baterias.forEach(normalizarPaineisRegistro);
  let data = baterias;

  if (filtros.dataInicio) {
    data = data.filter(b => b.data >= filtros.dataInicio);
  }
  if (filtros.dataFim) {
    data = data.filter(b => b.data <= filtros.dataFim);
  }
  if (filtros.turno) {
    data = data.filter(b => b.turno === filtros.turno);
  }

  const total_baterias = data.length;
  const total_paineis = data.reduce((s, b) => s + (b.total_paineis || 0), 0);
  const total_m2 = data.reduce((s, b) => s + (b.m2_total || 0), 0);
  // Agregação genérica por tipo de placa (suporta N tipos: 2p, sp, 3p, ...)
  const total_paineis_por_tipo = somarPorTipo(data, 'paineis_por_tipo');
  const total_m2_por_tipo = somarPorTipo(data, 'm2_por_tipo');
  // Aliases de compatibilidade (sempre presentes, mesmo que 0)
  const total_paineis_2p = total_paineis_por_tipo['2p'] || 0;
  const total_paineis_sp = total_paineis_por_tipo['sp'] || 0;
  const total_m2_2p = total_m2_por_tipo['2p'] || 0;
  const total_m2_sp = total_m2_por_tipo['sp'] || 0;
  const baterias_atraso = data.filter(b => b.houve_atraso === 'SIM').length;
  const pct_atraso = total_baterias ? Math.round(baterias_atraso / total_baterias * 100) : 0;
  const media_tempo = total_baterias
    ? data.reduce((s, b) => s + (b.tempo_min || 0), 0) / total_baterias
    : 0;
  const media_tracos = total_baterias
    ? data.reduce((s, b) => s + (b.qtd_tracos || 0), 0) / total_baterias
    : 0;

  const dias_set = new Set(data.map(b => b.data));
  const dias_producao = dias_set.size;

  // By date
  const por_data = {};
  data.forEach(b => {
    if (!por_data[b.data]) por_data[b.data] = { qtd: 0, atraso: 0, m2: 0 };
    por_data[b.data].qtd++;
    if (b.houve_atraso === 'SIM') por_data[b.data].atraso++;
    por_data[b.data].m2 += (b.m2_total || 0);
  });

  // By turno
  const por_turno = {};
  ['1º TURNO', '2º TURNO', '3º TURNO'].forEach(t => {
    const td = data.filter(b => b.turno === t);
    const paineisPorTipoTurno = somarPorTipo(td, 'paineis_por_tipo');
    const m2PorTipoTurno = somarPorTipo(td, 'm2_por_tipo');
    por_turno[t] = {
      total: td.length,
      atraso: td.filter(b => b.houve_atraso === 'SIM').length,
      m2: td.reduce((s, b) => s + (b.m2_total || 0), 0),
      tempo_medio: td.length ? td.reduce((s, b) => s + (b.tempo_min || 0), 0) / td.length : 0,
      paineis: td.reduce((s, b) => s + (b.total_paineis || 0), 0),
      paineis_por_tipo: paineisPorTipoTurno,
      m2_por_tipo: m2PorTipoTurno,
      // Aliases de compatibilidade:
      paineis_2p: paineisPorTipoTurno['2p'] || 0,
      paineis_sp: paineisPorTipoTurno['sp'] || 0,
      m2_2p: m2PorTipoTurno['2p'] || 0,
      m2_sp: m2PorTipoTurno['sp'] || 0,
    };
  });

  // Motivos de atraso
  const motivos = {};
  data.filter(b => b.houve_atraso === 'SIM' && b.motivo_atraso)
    .forEach(b => {
      const m = b.motivo_atraso.toLowerCase().trim();
      motivos[m] = (motivos[m] || 0) + 1;
    });

  return {
    total_baterias, total_paineis, total_paineis_2p, total_paineis_sp,
    total_m2, total_m2_2p, total_m2_sp,
    baterias_atraso, pct_atraso, media_tempo, media_tracos,
    dias_producao, por_data, por_turno, motivos, data
  };
}

// ---- Sobra de Traço ----

/**
 * Carrega sobra.json do servidor.
 * Retorna o objeto de sobra, ou null se não existir / não estiver ativa.
 */
async function getSobra() {
  try {
    const res = await fetch('sobra.json?_=' + Date.now()); // evita cache
    if (!res.ok) return null;
    const sobra = await res.json();
    // Só retorna se estiver realmente ativa
    return (sobra && sobra.ativa === true) ? sobra : null;
  } catch (_) { return null; }
}

/**
 * Persiste o objeto de sobra no servidor (sobra.json).
 * @param {object} sobra – objeto conforme estrutura definida
 */
async function salvarSobra(sobra) {
  const res = await fetch('/salvar-sobra', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sobra),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.erro || 'Erro ao salvar sobra');
}

/**
 * Desativa a sobra atual, marcando-a como inativa e registrando motivo.
 * @param {'utilizada'|'descartada'} motivo
 */
async function desativarSobra(motivo) {
  const atual = await getSobra();
  if (!atual) return; // já não existe sobra ativa
  await salvarSobra({ ...atual, ativa: false, status: motivo, dataEncerramento: new Date().toISOString() });
}

// ---- Export ----

window.LW = {
  // Constantes fixas
  TURNO_OPTS,
  M2_POR_PAINEL,
  LIMITE_INJECAO_MIN,

  // Getters dinâmicos — leem do estado após config.json carregar
  get DIMENSAO_OPTS() { return DIMENSAO_OPTS; },
  get MONTAGEM_OPTS() { return MONTAGEM_OPTS; },
  get MONTAGEM_MAP() { return MONTAGEM_MAP; },
  get BATERIA_IDS() { return BATERIA_IDS; },
  get VOLUME_POR_PLACA() { return VOLUME_POR_PLACA; },


  // Config loader
  loadConfig,
  waitConfig,

  // Storage
  getOperacaoAtual, saveOperacaoAtual, clearOperacaoAtual,

  // Cálculos
  calcPaineis,
  normalizarPaineisRegistro,
  somarPorTipo,
  extrairComponentesMontagem,

  // Formatação
  formatTime, diffMinutes, formatDuration,

  // Relatório de Injeção
  registrarRelatorioInjecao,
  getRelatorioInjecao,
  getTotalTracosHoje,
  confirmarTracosHoje,

  // Dados e analytics
  registrarOperacao, getStats,

  // Sobra de traço
  getSobra, salvarSobra, desativarSobra,
};