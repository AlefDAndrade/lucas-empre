// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  operacao.js — Tela de Operação logic
// ============================================================

'use strict';

(function () {

  // ---- State ----
  let state = {
    turno: '1º TURNO',
    dimensao: '',
    tipo_montagem: '',
    id_bateria: '',
    bercos_reais: '',
    inicio: null,
    fim: null,
    status: 'idle',      // idle | running | finished
    tracos: [],
  };

  let timerInterval = null;

  // ---- DOM refs ----
  const $ = id => document.getElementById(id);

  function init() {
    // Carrega config.json e só depois inicializa a tela
    LW.loadConfig().then(() => {
      populateSelects();

      const saved = LW.getOperacaoAtual();
      if (saved) {
        state = saved;
        renderAll();
        if (state.status === 'running') startTimerUI();
      }

      wireEvents();
      setInterval(updateClock, 1000);
      updateClock();
      renderAll();
    });
  }

  // Preenche os <select> com dados do config.json
  function populateSelects() {
    // ID da bateria
    const selBateria = document.getElementById('op-id-bateria');
    selBateria.innerHTML = '<option selected disabled hidden></option>';
    LW.BATERIA_IDS.forEach(id => {
      const opt = document.createElement('option');
      // Como id agora é um objeto {id, label, bercos}
      opt.value = id.id; opt.textContent = id.id;
      selBateria.appendChild(opt);
    });

    // Tipo de montagem
    const selMont = document.getElementById('op-montagem');
    selMont.innerHTML = '<option selected disabled hidden></option>';
    LW.MONTAGEM_OPTS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      selMont.appendChild(opt);
    });

    // Atualiza referência rápida
    renderReferencia();
  }

  function renderReferencia() {
    const el = document.getElementById('ref-rapida-list');
    if (!el) return;
    el.innerHTML = LW.DIMENSAO_OPTS.map(d =>
      '<div style="display:flex;justify-content:space-between">' +
      '<span>' + d.label + '</span>' +
      '<span style="color:var(--text-3)">' + d.bercos + ' berços → ' + (d.bercos * 2) + ' painéis</span>' +
      '</div>'
    ).join('');
  }

  function wireEvents() {
    $('op-turno').addEventListener('change', e => {
      state.turno = e.target.value; persist();
    });
    $('op-montagem').addEventListener('change', e => {
      state.tipo_montagem = e.target.value;
      recalcPaineis();
      persist();
    });
    $('op-id-bateria').addEventListener('change', e => {
      state.id_bateria = e.target.value;
      updateCapacidade();
      recalcPaineis();
      persist();
      updatePendencias();
    });
    $('op-bercos-reais').addEventListener('input', e => {
      state.bercos_reais = e.target.value;
      recalcPaineis();
      persist();
    });
    if (document.getElementById('op-silo')) $('op-silo').addEventListener('change', e => {
      state.silo = e.target.value; persist();
    });
    if (document.getElementById('op-expansao')) $('op-expansao').addEventListener('change', e => {
      state.expansao = e.target.value; persist();
    });
    $('op-motivo').addEventListener('input', e => {
      state.motivo_atraso = e.target.value; persist();
    });
    $('btn-iniciar').addEventListener('click', iniciarInjecao);
    $('btn-finalizar').addEventListener('click', finalizarInjecao);
    $('btn-registrar').addEventListener('click', registrarOperacao);
    $('btn-resetar').addEventListener('click', resetarOperacao);
    $('btn-add-traco').addEventListener('click', addTraco);
  }

  function updateClock() {
    const el = document.getElementById('topbar-clock');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR');
  }

  function updateCapacidade() {
    const bateria = LW.BATERIA_IDS.find(b => b.id === state.id_bateria);
    if (bateria) {
      state.dimensao = bateria.label; // Sincroniza a dimensão automaticamente
      $('op-capacidade').value = `${bateria.bercos} berços`;
      if ($('op-dimensao')) $('op-dimensao').value = state.dimensao;
    } else {
      state.dimensao = '';
      $('op-capacidade').value = '';
      if ($('op-dimensao')) $('op-dimensao').value = '';
    }
  }

  function recalcPaineis() {
    const bateria = LW.BATERIA_IDS.find(b => b.id === state.id_bateria);
    const bercos = parseInt(state.bercos_reais) || (bateria?.bercos || 0);

    if (!bercos || !state.tipo_montagem) {
      $('op-paineis-total').textContent = '—';
      $('op-paineis-2p').textContent = '—';
      $('op-paineis-sp').textContent = '—';
      $('op-m2-total').textContent = '—';
      $('op-m2-2p').textContent = '—';
      $('op-m2-sp').textContent = '—';
      $('op-placas-cimenticia').textContent = '—';
      return;
    }
    const r = LW.calcPaineis(state.tipo_montagem, bercos);
    $('op-paineis-total').textContent = r.total_paineis;
    $('op-paineis-2p').textContent = r.paineis_2p;
    $('op-paineis-sp').textContent = r.paineis_sp;
    $('op-m2-total').textContent = r.m2_total.toFixed(2) + ' m²';
    $('op-m2-2p').textContent = r.m2_2p.toFixed(2) + ' m²';
    $('op-m2-sp').textContent = r.m2_sp.toFixed(2) + ' m²';
    $('op-placas-cimenticia').textContent = r.placas_cimenticia;
  }

  function iniciarInjecao() {
    if (state.status !== 'idle') return;
    state.inicio = new Date().toISOString();
    state.status = 'running';
    $('op-inicio').value = LW.formatTime(state.inicio);
    $('btn-iniciar').disabled = true;
    $('btn-finalizar').disabled = false;
    startTimerUI();
    persist();
    updateStatusBanner();
    updatePendencias();
  }

  function finalizarInjecao() {
    if (state.status !== 'running') return;
    state.fim = new Date().toISOString();
    state.status = 'finished';
    clearInterval(timerInterval);
    $('op-fim').value = LW.formatTime(state.fim);
    $('btn-finalizar').disabled = true;

    const minutos = LW.diffMinutes(state.inicio, state.fim);
    state.tempo_min = minutos;

    const atraso = minutos > LW.LIMITE_INJECAO_MIN;
    state.houve_atraso = atraso ? 'SIM' : 'NÃO';
    $('op-atraso').innerHTML = atraso
      ? '<span class="badge badge-red">⚠ SIM — ' + Math.round(minutos) + 'min</span>'
      : '<span class="badge badge-green">✓ NÃO — ' + Math.round(minutos) + 'min</span>';

    $('op-motivo-row').style.display = atraso ? 'flex' : 'none';
    $('op-tempo-total').textContent = LW.formatDuration(minutos);

    persist();
    updateStatusBanner();
    updatePendencias();
  }

  function startTimerUI() {
    timerInterval = setInterval(() => {
      if (!state.inicio) return;
      const elapsed = LW.diffMinutes(state.inicio, new Date().toISOString());
      const el = $('timer-display');
      if (!el) return;
      const m = Math.floor(elapsed);
      const s = Math.floor((elapsed - m) * 60);
      el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      el.className = 'timer-display' + (m >= LW.LIMITE_INJECAO_MIN ? ' danger' : m >= 50 ? ' warning' : '');
    }, 1000);
  }

  function updateStatusBanner() {
    const banner = $('status-banner');
    if (state.status === 'idle') {
      banner.innerHTML = '<span class="badge badge-gray">⬤ Aguardando início</span>';
    } else if (state.status === 'running') {
      banner.innerHTML = '<span class="badge badge-amber">◉ Injeção em andamento</span>';
    } else {
      banner.innerHTML = '<span class="badge badge-green">✓ Finalizado</span>';
    }
  }

  // Cria estrutura de insumo com suporte a ajustes
  function criarInsumo(valorOriginal) {
    const original = valorOriginal === '' ? '' : parseFloat(valorOriginal) || 0;
    return {
      original,
      ajustes: [],
      get total() {
        if (this.original === '') return '';
        return this.ajustes.reduce((s, a) => s + a, parseFloat(this.original) || 0);
      }
    };
  }

  // Retorna o total de um insumo (serializado, sem getter)
  function totalInsumo(insumo) {
    if (insumo.original === '') return '';
    return insumo.ajustes.reduce((s, a) => s + a, parseFloat(insumo.original) || 0);
  }

  // Migra traços antigos (campos _real simples) para nova estrutura com ajustes
  function migrarTraco(t) {
    const insumos = ['cimento', 'agua', 'eps', 'superplast', 'incorporador'];
    insumos.forEach(key => {
      const realKey = key + '_real';
      if (t[realKey] !== undefined && (typeof t[realKey] === 'string' || typeof t[realKey] === 'number')) {
        t[realKey] = { original: t[realKey], ajustes: [] };
      }
    });
    // Migrar densidade e flow se necessário
    ['densidade', 'flow'].forEach(key => {
      if (t[key] !== undefined && typeof t[key] !== 'object') {
        t[key + '_insumo'] = { original: t[key], ajustes: [] };
      }
    });
    return t;
  }

  function addTraco() {
    const num = state.tracos.length + 1;
    state.tracos.push({
      id: 'traco_' + Date.now() + '_' + num,
      num,
      berco_ini: '',
      berco_fim: '',
      // Receita real pesada — nova estrutura com ajustes
      cimento_real:      { original: '', ajustes: [] },
      agua_real:         { original: '', ajustes: [] },
      eps_real:          { original: '', ajustes: [] },
      superplast_real:   { original: '', ajustes: [] },
      incorporador_real: { original: '', ajustes: [] },
      tempo_batida: '',
      // Resultado
      densidade_insumo: { original: '', ajustes: [] },
      flow_insumo:      { original: '', ajustes: [] },
      // campos legados mantidos por compatibilidade
      densidade: '',
      flow: '',
      obs: '',
      silo: '',
      expansao: '',
      densidadeEPS: ''
    });
    renderTracos();
    persist();
  }

  function removeTraco(i) {
    state.tracos.splice(i, 1);
    state.tracos.forEach((t, idx) => t.num = idx + 1);
    renderTracos();
    persist();
  }

  // Formata a exibição dos ajustes: "9,5 + 0,5 + 0,3 = 10,3"
  function formatAjustesDisplay(insumo, decimais) {
    if (!insumo || insumo.original === '') return '';
    const orig = parseFloat(insumo.original) || 0;
    if (!insumo.ajustes || insumo.ajustes.length === 0) return '';
    const partes = [orig.toFixed(decimais), ...insumo.ajustes.map(a => a.toFixed(decimais))];
    const tot = totalInsumo(insumo);
    return partes.join(' + ') + ' = ' + (tot !== '' ? parseFloat(tot).toFixed(decimais) : '');
  }

  // Renderiza campo de insumo com botão de ajuste
  function renderCampoInsumo(t, i, fieldKey, label, step, decimais, placeholder) {
    const insumo = t[fieldKey] || { original: '', ajustes: [] };
    const valorExibido = insumo.original;
    const temAjustes = insumo.ajustes && insumo.ajustes.length > 0;
    const displayAjustes = temAjustes ? formatAjustesDisplay(insumo, decimais) : '';
    const total = temAjustes ? totalInsumo(insumo) : '';

    return `
      <div class="form-group insumo-group">
        <label class="form-label">${label}</label>
        <div class="insumo-input-row">
          <input class="form-input" type="number" step="${step}"
            value="${valorExibido}"
            oninput="LWOp.updateInsumoOriginal(${i},'${fieldKey}',this.value)"
            placeholder="${placeholder}">
          <button class="btn-ajuste" title="Adicionar ajuste" onclick="LWOp.abrirAjuste(${i},'${fieldKey}',this)">+</button>
        </div>
        ${temAjustes ? `
          <div class="insumo-ajustes-display">
            <span class="ajustes-formula">${displayAjustes}</span>
            <span class="ajustes-total-badge">Total: ${parseFloat(total).toFixed(decimais)}</span>
          </div>` : ''}
        <div class="ajuste-painel" id="ajuste-painel-${i}-${fieldKey}" style="display:none">
          <div class="ajuste-painel-titulo">Adicionar ajuste</div>
          <label class="form-label">Quantidade:</label>
          <input class="form-input ajuste-qty-input" type="number" step="${step}"
            id="ajuste-input-${i}-${fieldKey}" placeholder="0" value="">
          <div class="ajuste-painel-btns">
            <button class="btn btn-primary btn-sm" onclick="LWOp.salvarAjuste(${i},'${fieldKey}')">Salvar</button>
            <button class="btn btn-ghost btn-sm" onclick="LWOp.fecharAjuste(${i},'${fieldKey}')">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  function renderTracos() {
    const container = $('tracos-container');
    container.innerHTML = '';
    state.tracos.forEach((t, i) => {
      // Garante migração de traços antigos
      migrarTraco(t);
      const row = document.createElement('div');
      row.className = 'traco-row';
      row.innerHTML = `
        <!-- Cabeçalho do traço -->
        <div class="traco-card-header">
          <span class="traco-num-label">Traço <strong>Nº ${t.num}</strong></span>
          <div class="traco-header-fields">
            <div class="form-group traco-header-field">
              <label class="form-label">Berço Início <span class="required">*</span></label>
              <input class="form-input" type="number" min="1" max="22" value="${t.berco_ini}"
                oninput="LWOp.updateTraco(${i},'berco_ini',this.value)" placeholder="1">
            </div>
            <div class="form-group traco-header-field">
              <label class="form-label">Berço Fim <span class="required">*</span></label>
              <input class="form-input" type="number" min="1" max="22" value="${t.berco_fim}"
                oninput="LWOp.updateTraco(${i},'berco_fim',this.value)" placeholder="22">
            </div>
            <div class="form-group traco-header-field">
              <label class="form-label">Silo <span class="required">*</span></label>
              <select class="form-select" onchange="LWOp.updateTraco(${i}, 'silo', this.value)">
                <option value=""></option>
                <option value="Silo 1" ${t.silo === 'Silo 1' ? 'selected' : ''}>Silo 1</option>
                <option value="Silo 2" ${t.silo === 'Silo 2' ? 'selected' : ''}>Silo 2</option>
                <option value="Silo 3" ${t.silo === 'Silo 3' ? 'selected' : ''}>Silo 3</option>
                <option value="Silo 4" ${t.silo === 'Silo 4' ? 'selected' : ''}>Silo 4</option>
              </select>
            </div>
            <div class="form-group traco-header-field">
              <label class="form-label">Expansão do EPS <span class="required">*</span></label>
              <select class="form-select" onchange="LWOp.updateTraco(${i}, 'expansao', this.value)">
                <option value=""></option>
                <option value="1ª expansão" ${t.expansao === '1ª expansão' ? 'selected' : ''}>1ª expansão</option>
                <option value="2ª expansão" ${t.expansao === '2ª expansão' ? 'selected' : ''}>2ª expansão</option>
              </select>
            </div>
          </div>
          <button class="traco-remove-btn" onclick="LWOp.removeTraco(${i})" title="Remover traço">✕</button>
        </div>

        <!-- Seção: Receita Real Pesada -->
        <div class="traco-section-label">⚖ Receita Real Pesada</div>
        <div class="traco-fields-grid traco-fields-grid--6">
          ${renderCampoInsumo(t, i, 'cimento_real',      'Cimento (kg)',        '0.01',  2, 'kg')}
          ${renderCampoInsumo(t, i, 'agua_real',         'Água (kg)',           '0.01',  2, 'kg')}
          ${renderCampoInsumo(t, i, 'eps_real',          'EPS (kg)',            '0.01',  2, 'kg')}
          ${renderCampoInsumo(t, i, 'superplast_real',   'Superplast. (kg)',    '0.001', 3, 'kg')}
          ${renderCampoInsumo(t, i, 'incorporador_real', 'Incorp. de Ar (kg)',  '0.001', 3, 'kg')}
          <div class="form-group">
            <label class="form-label">Tempo de Batida (s)</label>
            <input class="form-input" type="number" step="1" value="${t.tempo_batida}"
              oninput="LWOp.updateTraco(${i},'tempo_batida',this.value)" placeholder="seg">
          </div>
        </div>

        <!-- Seção: Resultado -->
        <div class="traco-section-label">📊 Resultado Obtido</div>
        <div class="traco-fields-grid traco-fields-grid--4">
          <div class="form-group">
            <label class="form-label">Densidade EPS</label>
            <input class="form-input" type="number" step="0.01" value="${t.densidadeEPS}"
              oninput="LWOp.updateTraco(${i},'densidadeEPS',this.value)" placeholder="kg/m³">
          </div>
          ${renderCampoInsumo(t, i, 'densidade_insumo', 'Densidade Obtida', '0.01', 2, 'kg/m³')}
          ${renderCampoInsumo(t, i, 'flow_insumo',      'Flow (mm)',        '1',    0, 'mm')}
          <div class="form-group traco-obs-field">
            <label class="form-label">Observações</label>
            <input class="form-input" type="text" value="${t.obs}"
              oninput="LWOp.updateTraco(${i},'obs',this.value)" placeholder="Ajustes, correções, falhas...">
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function updatePendencias() {
    const tracosComSilo = state.tracos.length > 0 && state.tracos.every(t => !!t.silo);
    const tracosComExp = state.tracos.length > 0 && state.tracos.every(t => !!t.expansao);
    const tracosComDensidadeEPS = state.tracos.length > 0 && state.tracos.every(t => !!t.densidadeEPS);
    const checks = [
      { label: 'Turno definido', ok: !!state.turno },
      { label: 'Dimensão da bateria', ok: !!state.dimensao },
      { label: 'Tipo de montagem', ok: !!state.tipo_montagem },
      { label: 'ID da bateria', ok: !!state.id_bateria },
      { label: 'Injeção iniciada', ok: !!state.inicio },
      { label: 'Injeção finalizada', ok: !!state.fim },
      { label: 'Motivo do atraso', ok: state.houve_atraso === 'NÃO' || !!state.motivo_atraso },
      { label: 'Ao menos 1 traço', ok: state.tracos.length > 0 },
      { label: 'Silo em todos os traços', ok: tracosComSilo },
      { label: 'Expansão em todos os traços', ok: tracosComExp },
      { label: 'Densidade EPS em todos os traços', ok: tracosComDensidadeEPS }
    ];

    const allOk = checks.every(c => c.ok);
    const list = $('pendencia-list');
    list.innerHTML = checks.map(c => `
      <div class="pendency-item ${c.ok ? 'ok' : 'err'}">
        <div class="dot"></div>
        <span>${c.label}</span>
      </div>
    `).join('');

    $('btn-registrar').disabled = !allOk;

    const badge = $('pendencia-badge');
    const pending = checks.filter(c => !c.ok).length;
    if (pending === 0) {
      badge.innerHTML = '<span class="badge badge-green">✓ Tudo preenchido</span>';
    } else {
      badge.innerHTML = `<span class="badge badge-red">${pending} pendência${pending > 1 ? 's' : ''}</span>`;
    }
  }

  function registrarOperacao() {
    const bateria = LW.BATERIA_IDS.find(b => b.id === state.id_bateria);
    const bercos = parseInt(state.bercos_reais) || (bateria?.bercos || 0);

    const calc = LW.calcPaineis(state.tipo_montagem, bercos);

    const data = new Date(state.inicio);

    const dataLocal =
      `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')
      }-${String(data.getDate()).padStart(2, '0')
      }`;

    const record = {
      id: 'op_' + Date.now(),
      data: dataLocal,
      turno: state.turno,
      dimensao: state.dimensao,
      capacidade: bateria?.bercos || 0,
      id_bateria: state.id_bateria,
      inicio: state.inicio,
      fim: state.fim,
      tempo_min: state.tempo_min,
      qtd_tracos: state.tracos.length,
      houve_atraso: state.houve_atraso,
      motivo_atraso: state.motivo_atraso || '',
      tipo_montagem: state.tipo_montagem,
      bercos_reais: bercos,
      ...calc,
      tracos: state.tracos.map(t => ({
        ...t,
        // Expõe os totais calculados como campos planos para relatórios
        cimento_total:      totalInsumo(t.cimento_real),
        agua_total:         totalInsumo(t.agua_real),
        eps_total:          totalInsumo(t.eps_real),
        superplast_total:   totalInsumo(t.superplast_real),
        incorporador_total: totalInsumo(t.incorporador_real),
        densidade_total:    totalInsumo(t.densidade_insumo),
        flow_total:         totalInsumo(t.flow_insumo),
        // Compatibilidade: também atualiza os campos legados
        densidade: totalInsumo(t.densidade_insumo) !== '' ? totalInsumo(t.densidade_insumo) : t.densidade,
        flow:      totalInsumo(t.flow_insumo)      !== '' ? totalInsumo(t.flow_insumo)      : t.flow,
      })),
    };

    Promise.all([
      LW.registrarOperacao(record),
      LW.registrarRelatorioInjecao(record),
    ])
      .then(() => {
        LW.clearOperacaoAtual();
        clearInterval(timerInterval);
        showSuccessModal(record);
        resetState();
        renderAll();
      })
      .catch(err => {
        alert('Erro ao salvar operação: ' + err.message);
      });
  }

  function showSuccessModal(record) {
    const modal = $('success-modal');
    $('modal-bateria').textContent = record.id_bateria;
    $('modal-tempo').textContent = LW.formatDuration(record.tempo_min);
    $('modal-paineis').textContent = record.total_paineis;
    $('modal-m2').textContent = record.m2_total.toFixed(2) + ' m²';
    $('modal-atraso').innerHTML = record.houve_atraso === 'SIM'
      ? '<span class="badge badge-red">SIM</span>'
      : '<span class="badge badge-green">NÃO</span>';
    modal.style.display = 'flex';
  }

  function resetarOperacao() {
    if (!confirm('Limpar todos os dados da operação atual?')) return;
    clearInterval(timerInterval);
    LW.clearOperacaoAtual();
    resetState();
    renderAll();
  }

  function resetState() {
    state = {
      turno: '1º TURNO',
      dimensao: '',
      tipo_montagem: '',
      id_bateria: '',
      bercos_reais: '',
      inicio: null,
      fim: null,
      status: 'idle',
      tracos: [],
    };
  }

  function renderAll() {
    // Set form values
    $('op-turno').value = state.turno || '1º TURNO';
    $('op-dimensao').value = state.dimensao || '';

    $('op-montagem').value = state.tipo_montagem || '';
    $('op-id-bateria').value = state.id_bateria || '';
    $('op-bercos-reais').value = state.bercos_reais || '';
    $('op-motivo').value = state.motivo_atraso || '';

    updateCapacidade();

    $('op-inicio').value = state.inicio ? LW.formatTime(state.inicio) : '';
    $('op-fim').value = state.fim ? LW.formatTime(state.fim) : '';
    $('op-tempo-total').textContent = state.tempo_min ? LW.formatDuration(state.tempo_min) : '—';

    if (state.houve_atraso) {
      const minutos = state.tempo_min || 0;
      $('op-atraso').innerHTML = state.houve_atraso === 'SIM'
        ? `<span class="badge badge-red">⚠ SIM — ${Math.round(minutos)}min</span>`
        : `<span class="badge badge-green">✓ NÃO — ${Math.round(minutos)}min</span>`;
    } else {
      $('op-atraso').textContent = '—';
    }

    $('op-motivo-row').style.display = state.houve_atraso === 'SIM' ? 'flex' : 'none';

    $('btn-iniciar').disabled = state.status !== 'idle';
    $('btn-finalizar').disabled = state.status !== 'running';

    $('op-data').textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    renderTracos();
    recalcPaineis();
    updateStatusBanner();
    updatePendencias();
  }

  function persist() {
    LW.saveOperacaoAtual(state);
    updatePendencias();
  }

  // ---- Public API ----
  window.LWOp = {
    init,
    updateTraco(i, field, value) {
      state.tracos[i][field] = value;
      persist();
    },
    // Atualiza o valor original de um insumo com estrutura {original, ajustes}
    updateInsumoOriginal(i, field, value) {
      const insumo = state.tracos[i][field];
      if (insumo && typeof insumo === 'object' && 'ajustes' in insumo) {
        insumo.original = value;
      } else {
        state.tracos[i][field] = { original: value, ajustes: [] };
      }
      persist();
    },
    // Abre o painel de ajuste para um insumo específico
    abrirAjuste(i, field, btn) {
      // Fecha qualquer painel aberto
      document.querySelectorAll('.ajuste-painel').forEach(p => {
        if (p.id !== `ajuste-painel-${i}-${field}`) p.style.display = 'none';
      });
      const painel = document.getElementById(`ajuste-painel-${i}-${field}`);
      if (!painel) return;
      const isOpen = painel.style.display !== 'none';
      painel.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        const input = document.getElementById(`ajuste-input-${i}-${field}`);
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
      }
    },
    // Salva o ajuste e recalcula o total
    salvarAjuste(i, field) {
      const input = document.getElementById(`ajuste-input-${i}-${field}`);
      if (!input) return;
      const qty = parseFloat(input.value);
      if (isNaN(qty)) { input.focus(); return; }

      let insumo = state.tracos[i][field];
      if (!insumo || typeof insumo !== 'object' || !('ajustes' in insumo)) {
        insumo = { original: '', ajustes: [] };
        state.tracos[i][field] = insumo;
      }
      insumo.ajustes.push(qty);
      persist();
      renderTracos();
    },
    // Fecha o painel sem salvar
    fecharAjuste(i, field) {
      const painel = document.getElementById(`ajuste-painel-${i}-${field}`);
      if (painel) painel.style.display = 'none';
    },
    removeTraco,
    closeModal() {
      $('success-modal').style.display = 'none';
    }
  };

})();