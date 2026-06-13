// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  dashboard.js — Dashboard Geral + Desempenho por Turnos
// ============================================================

'use strict';

(function () {

  // ---- Simple bar chart (pure canvas) ----
  function drawBarChart(canvasId, labels, values, color = '#f59e0b') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = 200;

    ctx.clearRect(0, 0, W, H);

    const max = Math.max(...values, 1);
    const pad = { top: 20, right: 16, bottom: 30, left: 36 };
    const bw = Math.max(4, (W - pad.left - pad.right) / labels.length - 4);
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    // Grid lines
    ctx.strokeStyle = '#2a2f3a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + chartH * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = '#5c6475';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(max * i / 4), pad.left - 4, y + 4);
    }

    labels.forEach((label, i) => {
      const x = pad.left + i * (chartW / labels.length) + (chartW / labels.length - bw) / 2;
      const barH = (values[i] / max) * chartH;
      const y = pad.top + chartH - barH;

      // Bar
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      const radius = 3;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + bw - radius, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
      ctx.lineTo(x + bw, y + barH);
      ctx.lineTo(x, y + barH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Label
      ctx.fillStyle = '#5c6475';
      ctx.font = '9px Barlow, sans-serif';
      ctx.textAlign = 'center';
      const lx = x + bw / 2;
      // Show only every Nth label to avoid crowding
      const step = Math.max(1, Math.floor(labels.length / 10));
      if (i % step === 0) ctx.fillText(label, lx, H - 6);
    });
  }

  // ---- Desempenho por Turnos ----

  function initTurnos() {
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    document.getElementById('turnos-data-inicio').value = d30;
    document.getElementById('turnos-data-fim').value = today;

    document.getElementById('btn-turnos-filtrar').addEventListener('click', renderTurnos);
    renderTurnos();
  }

  async function renderTurnos() {
    const inicio = document.getElementById('turnos-data-inicio').value;
    const fim = document.getElementById('turnos-data-fim').value;
    const s = await LW.getStats({ dataInicio: inicio, dataFim: fim });

    const turnos = ['1º TURNO', '2º TURNO', '3º TURNO'];
    const ids = ['t1', 't2', 't3'];

    turnos.forEach((t, i) => {
      const td = s.por_turno[t];
      const id = ids[i];
      document.getElementById(`${id}-baterias`).textContent = td.total;
      document.getElementById(`${id}-paineis`).textContent = td.paineis.toLocaleString('pt-BR');
      document.getElementById(`${id}-m2`).textContent = td.m2.toFixed(0) + ' m²';
      document.getElementById(`${id}-atraso`).textContent = td.total ? Math.round(td.atraso / td.total * 100) + '%' : '—';
      document.getElementById(`${id}-tempo`).textContent = LW.formatDuration(td.tempo_medio);
      document.getElementById(`${id}-2p`).textContent = td.paineis_2p.toLocaleString('pt-BR');
      document.getElementById(`${id}-sp`).textContent = td.paineis_sp.toLocaleString('pt-BR');
    });

    // Turno mais/menos eficiente (por m²)
    const byM2 = turnos.map(t => ({ t, m2: s.por_turno[t].m2 })).filter(x => x.m2 > 0);
    if (byM2.length) {
      byM2.sort((a, b) => b.m2 - a.m2);
      document.getElementById('melhor-turno').textContent = byM2[0].t;
      document.getElementById('pior-turno').textContent = byM2[byM2.length - 1].t;
    }

    // Bar charts por turno
    requestAnimationFrame(() => {
      drawBarChart('chart-turnos-m2', turnos.map(t => t.replace('º TURNO', '')), turnos.map(t => s.por_turno[t].m2), '#3b82f6');
      drawBarChart('chart-turnos-atraso', turnos.map(t => t.replace('º TURNO', '')), turnos.map(t => s.por_turno[t].atraso), '#ef4444');
    });

    // Insights turnos
    const el = document.getElementById('turnos-insights');
    const items = [];
    if (byM2.length) {
      items.push({ icon: '🏆', text: `Turno mais produtivo: ${byM2[0].t} com ${byM2[0].m2.toFixed(0)} m²` });
    }
    turnos.forEach(t => {
      const td = s.por_turno[t];
      if (td.total > 0 && td.atraso / td.total > 0.3) {
        items.push({ icon: '⚠️', text: `${t}: alta taxa de atraso (${Math.round(td.atraso / td.total * 100)}%)` });
      }
    });
    if (!items.length) {
      items.push({ icon: '✅', text: 'Desempenho equilibrado entre os turnos no período.' });
    }
    el.innerHTML = items.map(i =>
      `<div class="insight-item"><span>${i.icon}</span><span>${i.text}</span></div>`
    ).join('');
  }

  // ---- Registro de Baterias (table) ----

  // ================================================================
  //  ENGINE DE FILTROS HIERÁRQUICOS
  //  Compartilhada entre Registro de Baterias e Relatório de Injeção
  // ================================================================

  // ---- Estado dos filtros (Sets para multi-seleção) ----
  const _filtrosRegistro = {
    data_inicio: null, data_fim: null,
    id_bateria: new Set(), turno: new Set(),
    dimensao: new Set(), tipo_montagem: new Set(), atraso: new Set(),
  };

  const _filtrosRelatorio = {
    data_inicio: null, data_fim: null,
    id_bateria: new Set(), num_traco: new Set(),
    dimensao: new Set(), turno: new Set(),
    silo: new Set(), expansao: new Set(),
    id_traco: new Set(), // filtro de navegação via Registro de Baterias
  };

  // Data de corte: produções anteriores a esta data não possuem vínculo de traço
  const TRACO_CUTOFF_DATE = '2026-06-05';

  // ---- Extrai valores únicos não-vazios de uma lista de objetos ----
  function _unicos(lista, campo) {
    return [...new Set(
      lista.map(r => r[campo]).filter(v => v !== null && v !== undefined && v !== '')
    )].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));
  }

  // ---- Gera categorias de filtro para Registro de Baterias ----
  function gerarCategoriasRegistro(dados) {
    return [
      { key: 'id_bateria', label: 'ID da Bateria', opcoes: _unicos(dados, 'id_bateria') },
      { key: 'dimensao', label: 'Dimensão', opcoes: _unicos(dados, 'dimensao') },
      { key: 'turno', label: 'Turno', opcoes: _unicos(dados, 'turno') },
      { key: 'tipo_montagem', label: 'Tipo de Montagem', opcoes: _unicos(dados, 'tipo_montagem') },
      { key: 'atraso', label: 'Atraso', opcoes: _unicos(dados, 'houve_atraso') },
    ].filter(c => c.opcoes.length > 0);
  }

  // ---- Gera categorias de filtro para Relatório de Injeção ----
  function gerarCategoriasRelatorio(linhas) {
    return [
      { key: 'id_bateria', label: 'ID da Bateria', opcoes: _unicos(linhas, 'id_bateria') },
      { key: 'num_traco', label: 'Nº Traço', opcoes: _unicos(linhas, 'num_traco').map(String) },
      { key: 'dimensao', label: 'Dimensão', opcoes: _unicos(linhas, 'dimensao') },
      { key: 'turno', label: 'Turno', opcoes: _unicos(linhas, 'turno') },
      { key: 'silo', label: 'Silo', opcoes: _unicos(linhas, 'silo') },
      { key: 'expansao', label: 'Expansão', opcoes: _unicos(linhas, 'expansao') },
    ].filter(c => c.opcoes.length > 0);
  }

  // ---- Constrói a UI de filtros hierárquicos ----
  // containerEl: id do div onde renderizar
  // cats: array de { key, label, opcoes[] }
  // filtrosObj: objeto de estado (_filtrosRegistro ou _filtrosRelatorio)
  // onChangeCb: função a chamar após cada alteração
  function buildFiltrosUI(containerId, cats, filtrosObj, onChangeCb) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    cats.forEach(cat => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;display:inline-block';

      // Botão da categoria
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm';
      btn.style.cssText = 'gap:5px;border-color:var(--border-2)';
      const ativos = filtrosObj[cat.key]?.size || 0;
      btn.innerHTML = `${cat.label}${ativos ? ` <span style="background:var(--accent);color:#000;border-radius:10px;padding:1px 6px;font-size:.65rem;font-weight:700">${ativos}</span>` : ''} <span style="opacity:.5;font-size:.7rem">▾</span>`;

      // Dropdown
      const dropdown = document.createElement('div');
      dropdown.style.cssText = [
        'position:absolute;top:calc(100% + 4px);left:0;z-index:200',
        'background:var(--bg-card);border:1px solid var(--border-2);border-radius:var(--radius-lg)',
        'min-width:180px;max-height:280px;overflow-y:auto;display:none',
        'box-shadow:0 8px 32px rgba(0,0,0,.5)',
      ].join(';');

      cat.opcoes.forEach(op => {
        const item = document.createElement('label');
        item.style.cssText = [
          'display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer',
          'font-size:.84rem;color:var(--text-2);transition:background .1s',
        ].join(';');
        item.onmouseover = () => item.style.background = 'var(--bg-3)';
        item.onmouseout = () => item.style.background = '';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(op);
        cb.checked = filtrosObj[cat.key]?.has(String(op)) || false;
        cb.style.cssText = 'accent-color:var(--accent);width:14px;height:14px;cursor:pointer';

        cb.addEventListener('change', () => {
          if (cb.checked) filtrosObj[cat.key].add(String(op));
          else filtrosObj[cat.key].delete(String(op));
          // Atualiza badge no botão
          const n = filtrosObj[cat.key].size;
          btn.innerHTML = `${cat.label}${n ? ` <span style="background:var(--accent);color:#000;border-radius:10px;padding:1px 6px;font-size:.65rem;font-weight:700">${n}</span>` : ''} <span style="opacity:.5;font-size:.7rem">▾</span>`;
          atualizarChips(containerId, filtrosObj, cats, onChangeCb);
          onChangeCb();
        });

        item.appendChild(cb);
        item.appendChild(document.createTextNode(String(op)));
        dropdown.appendChild(item);
      });

      // Toggle dropdown ao clicar no botão
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const aberto = dropdown.style.display === 'block';
        // Fecha todos os outros dropdowns
        document.querySelectorAll('.lw-filter-dropdown').forEach(d => d.style.display = 'none');
        dropdown.style.display = aberto ? 'none' : 'block';
      });

      // Fecha ao clicar fora
      document.addEventListener('click', () => { dropdown.style.display = 'none'; }, { passive: true });

      dropdown.classList.add('lw-filter-dropdown');
      wrapper.appendChild(btn);
      wrapper.appendChild(dropdown);
      container.appendChild(wrapper);
    });
  }

  // ---- Atualiza área de chips de filtros ativos ----
  function atualizarChips(containerId, filtrosObj, cats, onChangeCb) {
    const chipsId = 'chips-' + containerId;
    const limparId = 'btn-limpar-' + containerId;
    const chipsEl = document.getElementById(chipsId);
    const limparEl = document.getElementById(limparId);
    if (!chipsEl) return;

    // Coleta todos os filtros ativos
    const chips = [];
    cats.forEach(cat => {
      filtrosObj[cat.key]?.forEach(val => {
        chips.push({ key: cat.key, val, label: `${cat.label}: ${val}`, tipo: 'normal' });
      });
    });

    // Chips especiais de navegação por traço (id_traco)
    if (containerId === 'filtros-relatorio' && filtrosObj.id_traco && filtrosObj.id_traco.size) {
      filtrosObj.id_traco.forEach(val => {
        chips.push({ key: 'id_traco', val, label: `🔗 Traço: ${val}`, tipo: 'traco' });
      });
    }

    if (!chips.length) {
      chipsEl.innerHTML = '<span style="color:var(--text-3);font-size:.78rem">Nenhum filtro ativo</span>';
      if (limparEl) limparEl.style.display = 'none';
      return;
    }

    if (limparEl) limparEl.style.display = 'inline-flex';

    chipsEl.innerHTML = chips.map(c => {
      const isTraco = c.tipo === 'traco';
      const bg = isTraco ? 'rgba(59,130,246,.12)' : 'rgba(245,158,11,.12)';
      const border = isTraco ? 'rgba(59,130,246,.35)' : 'rgba(245,158,11,.3)';
      const color = isTraco ? 'var(--blue,#3b82f6)' : 'var(--accent)';
      return `
      <span style="
        display:inline-flex;align-items:center;gap:5px;
        background:${bg};border:1px solid ${border};
        border-radius:20px;padding:3px 10px;font-size:.76rem;color:${color};
      ">
        ${c.label}
        <button onclick="removerFiltro('${containerId}','${c.key}','${c.val}')"
          style="background:none;border:none;cursor:pointer;color:${color};font-size:.8rem;padding:0;line-height:1;opacity:.7"
          title="Remover">✕</button>
      </span>`;
    }).join('');
  }

  // ---- Remove um filtro individual via chip ----
  window.removerFiltro = function (containerId, key, val) {
    const filtrosObj = containerId === 'filtros-registro' ? _filtrosRegistro : _filtrosRelatorio;
    filtrosObj[key]?.delete(val);
    // Rebuild UI para refletir estado
    const rebuildFn = containerId === 'filtros-registro' ? initRegistro : initRelatorio;
    rebuildFn();
  };

  // ---- Limpa todos os filtros de um container ----
  window.limparTodosFiltros = function (containerId) {
    const filtrosObj = containerId === 'filtros-registro' ? _filtrosRegistro : _filtrosRelatorio;
    Object.keys(filtrosObj).forEach(k => {
      if (filtrosObj[k] instanceof Set) filtrosObj[k].clear();
      else filtrosObj[k] = null;
    });
    // Reseta inputs de data
    const prefix = containerId === 'filtros-registro' ? 'reg' : 'rel';
    const ini = document.getElementById(`${prefix}-data-inicio`);
    const fim = document.getElementById(`${prefix}-data-fim`);
    if (ini) ini.value = '';
    if (fim) fim.value = '';
    const rebuildFn = containerId === 'filtros-registro' ? initRegistro : initRelatorio;
    rebuildFn();
  };

  // ================================================================
  //  REGISTRO DE BATERIAS
  // ================================================================

  async function initRegistro() {
    const s = await LW.getStats();
    const cats = gerarCategoriasRegistro(s.data);
    buildFiltrosUI('filtros-registro', cats, _filtrosRegistro, renderRegistro);
    atualizarChips('filtros-registro', _filtrosRegistro, cats, renderRegistro);

    ['reg-data-inicio', 'reg-data-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.removeEventListener('change', _onDataRegistro);
      el.addEventListener('change', _onDataRegistro);
    });

    renderRegistro();
  }

  function _onDataRegistro(e) {
    _filtrosRegistro[e.target.id === 'reg-data-inicio' ? 'data_inicio' : 'data_fim'] = e.target.value || null;
    renderRegistro();
  }

  async function renderRegistro() {
    const s = await LW.getStats();
    let data = [...s.data];

    const f = _filtrosRegistro;
    if (f.data_inicio) data = data.filter(b => b.data >= f.data_inicio);
    if (f.data_fim) data = data.filter(b => b.data <= f.data_fim);
    if (f.id_bateria.size) data = data.filter(b => f.id_bateria.has(b.id_bateria));
    if (f.turno.size) data = data.filter(b => f.turno.has(b.turno));
    if (f.dimensao.size) data = data.filter(b => f.dimensao.has(b.dimensao));
    if (f.tipo_montagem.size) data = data.filter(b => f.tipo_montagem.has(b.tipo_montagem));
    if (f.atraso.size) data = data.filter(b => f.atraso.has(b.houve_atraso));

    data = [...data].sort((a, b) => b.data.localeCompare(a.data) || (b.inicio || '').localeCompare(a.inicio || ''));

    const tbody = document.getElementById('registro-tbody');
    document.getElementById('reg-count').textContent = data.length + ' registros';

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="20" style="text-align:center;color:var(--text-3);padding:30px">Nenhum registro encontrado</td></tr>`;
      return;
    }

    // Mapa temporário para lookup por índice (evita serializar JSON em atributos HTML)
    window._lwRegistroMapTemp = {};
    tbody.innerHTML = data.map((b, idx) => {
      window._lwRegistroMapTemp[idx] = b;
      return `
      <tr style="cursor:pointer" title="Clique para ver os traços desta bateria no Relatório de Injeção"
        onclick="LWDash.navegarParaTracosDoRegistro(window._lwRegistroMapTemp[${idx}])">
        <td class="mono">${b.data ? b.data.split('-').reverse().join('/') : '—'}</td>
        <td><span class="badge badge-gray">${b.turno || '—'}</span></td>
        <td>${b.dimensao || '—'}</td>
        <td>${b.capacidade || '—'}</td>
        <td>${b.id_bateria || '—'}</td>
        <td class="mono">${b.inicio ? LW.formatTime(b.inicio) : '—'}</td>
        <td class="mono">${b.fim ? LW.formatTime(b.fim) : '—'}</td>
        <td class="mono">${LW.formatDuration(b.tempo_min)}</td>
        <td>${b.qtd_tracos || 0}</td>
        <td>${b.houve_atraso === 'SIM'
          ? `<span class="badge badge-red" title="${b.motivo_atraso || ''}">⚠ SIM</span>`
          : '<span class="badge badge-green">✓ NÃO</span>'}</td>
        <td>${b.motivo_atraso || '—'}</td>
        <td><span class="badge ${b.tipo_montagem === '2/P' ? 'badge-blue' : b.tipo_montagem === 'S/P' ? 'badge-green' : 'badge-amber'}">${b.tipo_montagem || '—'}</span></td>
        <td>${b.total_paineis || 0}</td>
        <td>${b.paineis_2p || 0}</td>
        <td>${b.paineis_sp || 0}</td>
        <td>${(b.m2_total || 0).toFixed(2)}</td>
        <td>${(b.m2_2p || 0).toFixed(2)}</td>
        <td>${(b.m2_sp || 0).toFixed(2)}</td>
        <td>${b.bercos_reais || '—'}</td>
        <td>${b.placas_cimenticia || 0}</td>
      </tr>`;
    }).join('');
  }

  // ================================================================
  //  RELATÓRIO DE INJEÇÃO
  // ================================================================

  async function initRelatorio() {
    const linhas = await LW.getRelatorioInjecao();
    const cats = gerarCategoriasRelatorio(linhas);
    buildFiltrosUI('filtros-relatorio', cats, _filtrosRelatorio, renderRelatorio);
    atualizarChips('filtros-relatorio', _filtrosRelatorio, cats, renderRelatorio);

    ['rel-data-inicio', 'rel-data-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.removeEventListener('change', _onDataRelatorio);
      el.addEventListener('change', _onDataRelatorio);
    });

    renderRelatorio();
  }

  function _onDataRelatorio(e) {
    _filtrosRelatorio[e.target.id === 'rel-data-inicio' ? 'data_inicio' : 'data_fim'] = e.target.value || null;
    renderRelatorio();
  }

  async function renderRelatorio() {
    const tbody = document.getElementById('relatorio-tbody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-3);padding:20px">Carregando...</td></tr>`;

    let linhas = await LW.getRelatorioInjecao();

    const f = _filtrosRelatorio;
    if (f.data_inicio) linhas = linhas.filter(l => l.data >= f.data_inicio);
    if (f.data_fim) linhas = linhas.filter(l => l.data <= f.data_fim);
    if (f.id_bateria.size) linhas = linhas.filter(l => f.id_bateria.has(l.id_bateria));
    if (f.num_traco.size) linhas = linhas.filter(l => f.num_traco.has(String(l.num_traco)));
    if (f.id_traco && f.id_traco.size) linhas = linhas.filter(l => l.id_traco && f.id_traco.has(l.id_traco));
    if (f.dimensao.size) linhas = linhas.filter(l => f.dimensao.has(l.dimensao));
    if (f.turno.size) linhas = linhas.filter(l => f.turno.has(l.turno));
    if (f.silo.size) linhas = linhas.filter(l => f.silo.has(l.silo));
    if (f.expansao.size) linhas = linhas.filter(l => f.expansao.has(l.expansao));
    document.getElementById('rel-count').textContent = linhas.length + ' registros';

    if (!linhas.length) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-3);padding:30px">Nenhum registro encontrado</td></tr>`;
      return;
    }

    const sorted = [...linhas].sort((a, b) =>
      b.data.localeCompare(a.data) ||
      (b.id_operacao || '').localeCompare(a.id_operacao || '') ||
      (a.num_traco - b.num_traco)
    );

    tbody.innerHTML = sorted.map(l => `
      <tr>
        <td class="mono">${l.data ? l.data.split('-').reverse().join('/') : '—'}</td>
        <td>${l.id_bateria || '—'}</td>
        <td>${l.num_traco || '—'}</td>
        <td class="mono">${l.berco_ini || '—'}</td>
        <td class="mono">${l.berco_fim || '—'}</td>
        <td>${l.densidade || '—'}</td>
        <td>${l.flow || '—'}</td>
        <td>${l.densidade_eps || '—'}</td>
        <td><span class="badge badge-blue">${l.expansao || '—'}</span></td>
        <td><span class="badge badge-gray">${l.silo || '—'}</span></td>
        <td>${l.cimento_real || '—'}</td>
        <td>${l.agua_real || '—'}</td>
        <td>${l.eps_real || '—'}</td>
        <td>${l.superplast_real || '—'}</td>
        <td>${l.incorporador_real || '—'}</td>
        <td>${(() => {
          // Extrai o valor caso l.tempo_batida ainda seja um objeto {original, ajustes}
          let val = (typeof l.tempo_batida === 'object' && l.tempo_batida !== null) 
            ? (l.tempo_batida.original || 0) : l.tempo_batida;
          return val ? LW.formatDuration(parseFloat(val) / 60) : '—';
        })()}</td>
        <td>${l.obs || '—'}</td>
        
      </tr>
    `).join('');
  }


  // ---- Export CSV ----

  const EXPORT_COLUNAS = [
    { campo: 'data', header: 'Data', padrao: true, fmt: v => v ? v.split('-').reverse().join('/') : '' },
    { campo: 'turno', header: 'Turno', padrao: true },
    { campo: 'id_bateria', header: 'ID Bateria', padrao: true },
    { campo: 'dimensao', header: 'Dimensão', padrao: true },
    { campo: 'capacidade', header: 'Cap. Berços', padrao: true },
    { campo: 'tipo_montagem', header: 'Tipo Montagem', padrao: true },
    { campo: 'inicio', header: 'Hora Início', padrao: true, fmt: v => { if (!v) return ''; const d = new Date(v); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); } },
    { campo: 'fim', header: 'Hora Fim', padrao: true, fmt: v => { if (!v) return ''; const d = new Date(v); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }); } },
    { campo: 'tempo_min', header: 'Duração', padrao: true, fmt: v => {
      if (!v || typeof v !== 'number') return '—';
      const totalSegundos = Math.round(v * 60);
      const m = Math.floor(totalSegundos / 60);
      const s = totalSegundos % 60;
      return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    } },
    { campo: 'qtd_tracos', header: 'Qtd Traços', padrao: true },
    { campo: 'houve_atraso', header: 'Houve Atraso', padrao: true },
    { campo: 'motivo_atraso', header: 'Motivo Atraso', padrao: true },
    { campo: 'bercos_reais', header: 'Berços Reais', padrao: true },
    { campo: 'placas_cimenticia', header: 'Placas Cimenticia', padrao: true, fmt: v => v || '—' },
    { campo: 'total_paineis', header: 'Total Painéis', padrao: true },
    { campo: 'paineis_2p', header: 'Painéis 2/P', padrao: true },
    { campo: 'paineis_sp', header: 'Painéis S/P', padrao: true },
    { campo: 'm2_total', header: 'm² Total', padrao: true, fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0,00' },
    { campo: 'm2_2p', header: 'm² 2/P', padrao: false, fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0,00' },
    { campo: 'm2_sp', header: 'm² S/P', padrao: false, fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0,00' },
  ];

  function gerarDownloadXLSX(dados, colsSel, sufixo) {
    // 1. Prepara os dados para o Excel
    const dadosExcel = dados.map(item => {
      const linha = {};
      colsSel.forEach(col => {
        const v = item[col.campo];
        linha[col.header] = col.fmt ? col.fmt(v) : (v !== undefined && v !== null ? v : '');
      });
      return linha;
    });

    // 2. Cria uma Planilha (Worksheet)
    const ws = XLSX.utils.json_to_sheet(dadosExcel);

    // 3. Ajuste Automático de Largura das Colunas
    const colWidths = colsSel.map(col => {
      const headerLen = col.header.length;
      const maxDataLen = dadosExcel.reduce((max, row) => {
        const val = String(row[col.header] || '');
        return Math.max(max, val.length);
      }, headerLen);
      return { wch: maxDataLen + 4 }; // Adiciona uma folga
    });
    ws['!cols'] = colWidths;

    // 4. Congelar Cabeçalho (Primeira Linha)
    // Usamos split e activePane para garantir compatibilidade máxima
    ws['!views'] = [
      {
        state: 'frozen',
        xSplit: 0,
        ySplit: 1, // Congela 1 linha
        topLeftCell: 'A2',
        activePane: 'bottomLeft'
      }
    ];

    // 5. Cria um Livro (Workbook) e adiciona a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produção");

    // 6. Gera o arquivo e inicia o download
    const nomeArquivo = 'lightwall_baterias_' + sufixo + '.xlsx';
    XLSX.writeFile(wb, nomeArquivo);
  }

  // Compatibilidade — exporta tudo com colunas padrão
  async function exportXLSX() {
    const s = await LW.getStats();
    gerarDownloadXLSX(s.data, EXPORT_COLUNAS.filter(c => c.padrao), new Date().toISOString().split('T')[0]);
  }

  async function abrirExportModal() {
    const grid = document.getElementById('exp-colunas-grid');
    grid.innerHTML = EXPORT_COLUNAS.map((c, i) =>
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;' +
      'border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-2)">' +
      '<input type="checkbox" id="exp-col-' + i + '" ' + (c.padrao ? 'checked' : '') +
      ' style="accent-color:var(--accent);width:15px;height:15px" onchange="LWDash.atualizarPreviewCount()">' +
      '<span style="font-size:.85rem">' + c.header + '</span></label>'
    ).join('');
    document.getElementById('exp-radio-tudo').checked = true;
    document.getElementById('exp-periodo-inputs').style.display = 'none';
    document.getElementById('exp-data-inicio').value = '';
    document.getElementById('exp-data-fim').value = '';
    await atualizarPreviewCount();
    document.getElementById('export-modal').style.display = 'flex';
  }

  function fecharExportModal() {
    document.getElementById('export-modal').style.display = 'none';
  }

  function onExportPeriodoChange(valor) {
    document.getElementById('exp-periodo-inputs').style.display = valor === 'periodo' ? 'flex' : 'none';
    atualizarPreviewCount();
  }

  function selecionarTodasColunas(marcar) {
    EXPORT_COLUNAS.forEach((_, i) => {
      const el = document.getElementById('exp-col-' + i);
      if (el) el.checked = marcar;
    });
    atualizarPreviewCount();
  }

  async function atualizarPreviewCount() {
    const s = await LW.getStats();
    let dados = s.data;
    const radio = document.querySelector('input[name="export-periodo"]:checked');
    if (radio && radio.value === 'periodo') {
      const ini = document.getElementById('exp-data-inicio').value;
      const fim = document.getElementById('exp-data-fim').value;
      if (ini) dados = dados.filter(b => b.data >= ini);
      if (fim) dados = dados.filter(b => b.data <= fim);
    }
    const qtdCols = EXPORT_COLUNAS.filter((_, i) => {
      const el = document.getElementById('exp-col-' + i);
      return el && el.checked;
    }).length;
    const el = document.getElementById('exp-preview-count');
    if (el) el.textContent = dados.length + ' registros · ' + qtdCols + ' colunas selecionadas';
  }

  async function confirmarExport() {
    const s = await LW.getStats();
    let dados = s.data;
    let sufixo = 'completo';
    const radio = document.querySelector('input[name="export-periodo"]:checked');
    if (radio && radio.value === 'periodo') {
      const ini = document.getElementById('exp-data-inicio').value;
      const fim = document.getElementById('exp-data-fim').value;
      if (ini) dados = dados.filter(b => b.data >= ini);
      if (fim) dados = dados.filter(b => b.data <= fim);
      if (ini || fim) sufixo = (ini || 'inicio') + '_a_' + (fim || 'fim');
    }
    const colsSel = EXPORT_COLUNAS.filter((_, i) => {
      const el = document.getElementById('exp-col-' + i);
      return el && el.checked;
    });
    if (!colsSel.length) { alert('Selecione ao menos uma coluna.'); return; }
    gerarDownloadXLSX(dados, colsSel, sufixo);
    fecharExportModal();
  }

  // ================================================================
  //  NAVEGAÇÃO: Registro de Baterias → Relatório de Injeção por Traços
  // ================================================================

  /**
   * Navega do Registro de Baterias para o Relatório de Injeção,
   * aplicando automaticamente filtros pelos traços vinculados à bateria.
   * @param {object} bateria - Registro completo da bateria (historico.json)
   */
  async function navegarParaTracosDoRegistro(bateria) {
    // Verifica se a produção é anterior ao corte de rastreamento de traços
    if (!bateria.data || bateria.data < TRACO_CUTOFF_DATE) {
      _mostrarAvisoSemTraco(bateria);
      return;
    }

    // Verifica se o registro possui traços vinculados
    const tracos = bateria.tracos;
    if (!tracos || !Array.isArray(tracos) || tracos.length === 0) {
      _mostrarAvisoSemTraco(bateria);
      return;
    }

    // Extrai os IDs de traço
    const idsTraco = tracos.map(t => t.id).filter(Boolean);
    if (!idsTraco.length) {
      _mostrarAvisoSemTraco(bateria);
      return;
    }

    // Limpa filtros anteriores do Relatório de Injeção
    Object.keys(_filtrosRelatorio).forEach(k => {
      if (_filtrosRelatorio[k] instanceof Set) _filtrosRelatorio[k].clear();
      else _filtrosRelatorio[k] = null;
    });

    // Aplica os IDs de traço como filtro de navegação
    idsTraco.forEach(id => _filtrosRelatorio.id_traco.add(id));

    // Reseta inputs de data do relatório
    const ini = document.getElementById('rel-data-inicio');
    const fim = document.getElementById('rel-data-fim');
    if (ini) ini.value = '';
    if (fim) fim.value = '';

    // Navega para a página do Relatório de Injeção
    if (typeof showPage === 'function') {
      showPage('relatorio');
    } else {
      window.LWDash.initRelatorio();
    }
  }

  /**
   * Exibe um aviso visual informando que o registro não possui vínculo de traço.
   */
  function _mostrarAvisoSemTraco(bateria) {
    const dataFormatada = bateria.data
      ? bateria.data.split('-').reverse().join('/')
      : '(data desconhecida)';
    const msg = `Esta produção (${bateria.id_bateria || ''} — ${dataFormatada}) foi registrada antes da implantação do sistema de rastreamento de traços e não possui vínculo de traço disponível.`;

    // Usa o modal de mensagem existente se disponível, senão alert simples
    if (typeof LWOp !== 'undefined' && LWOp.showToast) {
      LWOp.showToast(msg, 'warn');
    } else {
      // Exibe um toast não-bloqueante inline
      _mostrarToastAviso(msg);
    }
  }

  /**
   * Toast não-bloqueante para avisos de sem-traço.
   */
  function _mostrarToastAviso(msg) {
    const existing = document.getElementById('lw-traco-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'lw-traco-toast';
    toast.style.cssText = [
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999',
      'background:var(--surface-2,#1e293b);border:1px solid rgba(245,158,11,.4)',
      'color:var(--accent,#f59e0b);border-radius:10px;padding:14px 20px',
      'font-size:.85rem;max-width:520px;text-align:center',
      'box-shadow:0 8px 32px rgba(0,0,0,.4);line-height:1.5',
      'display:flex;align-items:flex-start;gap:10px',
    ].join(';');
    toast.innerHTML = `
      <span style="font-size:1.2rem;flex-shrink:0">⚠️</span>
      <span>${msg}</span>
      <button onclick="document.getElementById('lw-traco-toast').remove()"
        style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:1rem;padding:0;margin-left:8px;flex-shrink:0;opacity:.7">✕</button>
    `;
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 7000);
  }


  // ---- Public ----
  window.LWDash = {
    initTurnos, initRegistro, initRelatorio, renderRelatorio,
    navegarParaTracosDoRegistro,
    exportCSV: exportXLSX, abrirExportModal, fecharExportModal, onExportPeriodoChange,
    selecionarTodasColunas, atualizarPreviewCount, confirmarExport,
  };
})();