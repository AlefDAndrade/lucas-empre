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

  function drawDonutChart(canvasId, segments, colors) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 120;
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2, cy = size / 2, r = 46, inner = 28;

    const total = segments.reduce((s, v) => s + v, 0);
    if (!total) return;

    let angle = -Math.PI / 2;
    segments.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      angle += slice;
    });

    // Center hole
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#1e2229';
    ctx.fill();
  }

  // ---- Dashboard Geral ----

  function initDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    document.getElementById('dash-data-inicio').value = d30;
    document.getElementById('dash-data-fim').value = today;

    document.getElementById('btn-dash-filtrar').addEventListener('click', renderDashboard);
    renderDashboard();
  }

  async function renderDashboard() {
    const inicio = document.getElementById('dash-data-inicio').value;
    const fim = document.getElementById('dash-data-fim').value;
    const s = await LW.getStats({ dataInicio: inicio, dataFim: fim });

    // KPIs
    document.getElementById('kpi-total-baterias').textContent = s.total_baterias;
    document.getElementById('kpi-total-paineis').textContent = s.total_paineis.toLocaleString('pt-BR');
    document.getElementById('kpi-total-m2').textContent = s.total_m2.toFixed(0) + ' m²';
    document.getElementById('kpi-pct-atraso').textContent = s.pct_atraso + '%';
    document.getElementById('kpi-tempo-medio').textContent = LW.formatDuration(s.media_tempo);
    document.getElementById('kpi-media-tracos').textContent = s.media_tracos.toFixed(1);
    document.getElementById('kpi-dias-prod').textContent = s.dias_producao;
    document.getElementById('kpi-paineis-2p').textContent = s.total_paineis_2p.toLocaleString('pt-BR');
    document.getElementById('kpi-paineis-sp').textContent = s.total_paineis_sp.toLocaleString('pt-BR');

    // Chart — baterias por dia (last 30 entries of por_data)
    const sortedDates = Object.keys(s.por_data).sort();
    const chartLabels = sortedDates.map(d => {
      const [y, m, dy] = d.split('-');
      return `${dy}/${m}`;
    });
    const chartVals = sortedDates.map(d => s.por_data[d].qtd);
    const chartAtraso = sortedDates.map(d => s.por_data[d].atraso);

    requestAnimationFrame(() => {
      drawBarChart('chart-baterias', chartLabels, chartVals, '#f59e0b');
      drawBarChart('chart-atrasos', chartLabels, chartAtraso, '#ef4444');

      // Donut tipos
      const total_h = s.data.filter(b => b.tipo_montagem === 'HÍBRIDA').length;
      const total_2p = s.data.filter(b => b.tipo_montagem === '2/P').length;
      const total_sp = s.data.filter(b => b.tipo_montagem === 'S/P').length;
      drawDonutChart('chart-tipos', [total_h, total_2p, total_sp], ['#f59e0b', '#3b82f6', '#10b981']);
      document.getElementById('donut-hibrida').textContent = total_h;
      document.getElementById('donut-2p').textContent = total_2p;
      document.getElementById('donut-sp').textContent = total_sp;
    });

    // Insights
    const insightEl = document.getElementById('dash-insights');
    const insights = generateInsights(s, sortedDates);
    insightEl.innerHTML = insights.map(i =>
      `<div class="insight-item"><span>${i.icon}</span><span>${i.text}</span></div>`
    ).join('');
  }

  function generateInsights(s, sortedDates) {
    const insights = [];

    if (!s.total_baterias) {
      return [{ icon: '📭', text: 'Nenhum dado no período selecionado.' }];
    }

    // Pico de produção
    const maxDia = sortedDates.reduce((best, d) =>
      (s.por_data[d].qtd > (s.por_data[best]?.qtd || 0)) ? d : best, sortedDates[0]);
    if (maxDia) {
      const [y, m, dy] = maxDia.split('-');
      insights.push({ icon: '📈', text: `Pico de produção em ${dy}/${m} com ${s.por_data[maxDia].qtd} baterias` });
    }

    // Maior concentração de atrasos
    const maxAtraso = sortedDates.reduce((best, d) =>
      (s.por_data[d].atraso > (s.por_data[best]?.atraso || 0)) ? d : best, sortedDates[0]);
    if (maxAtraso && s.por_data[maxAtraso].atraso > 0) {
      const [y, m, dy] = maxAtraso.split('-');
      insights.push({ icon: '🚨', text: `Maior concentração de atrasos em ${dy}/${m} (${s.por_data[maxAtraso].atraso} ocorrências)` });
    }

    // % atraso
    if (s.pct_atraso > 30) {
      insights.push({ icon: '⚠️', text: `Taxa de atraso elevada: ${s.pct_atraso}% das baterias atrasaram` });
    } else {
      insights.push({ icon: '🟢', text: `Atrasos controlados: apenas ${s.pct_atraso}% das baterias` });
    }

    // Produção média por dia
    const mediaDia = s.dias_producao ? (s.total_baterias / s.dias_producao).toFixed(1) : 0;
    insights.push({ icon: '📊', text: `Média de ${mediaDia} baterias por dia de produção` });

    // Tempo médio
    insights.push({ icon: '⏱', text: `Tempo médio de injeção: ${LW.formatDuration(s.media_tempo)}` });

    // Motivo mais frequente
    const motivos = Object.entries(s.motivos).sort((a, b) => b[1] - a[1]);
    if (motivos.length) {
      insights.push({ icon: '🔧', text: `Motivo de atraso mais frequente: "${motivos[0][0]}" (${motivos[0][1]}x)` });
    }

    return insights;
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

  function initRegistro() {
    document.getElementById('btn-registro-filtrar').addEventListener('click', renderRegistro);
    document.getElementById('reg-busca').addEventListener('input', renderRegistro);
    // Novos filtros — aplicam ao mudar
    ['reg-turno', 'reg-montagem', 'reg-dimensao', 'reg-tracos', 'reg-capacidade', 'reg-atraso', 'reg-data-inicio', 'reg-data-fim', 'reg-id-bateria'].forEach(id => {
      document.getElementById(id).addEventListener('change', renderRegistro);
    });
    // Botão limpar
    document.getElementById('btn-registro-limpar').addEventListener('click', () => {
      ['reg-busca', 'reg-id-bateria', 'reg-data-inicio', 'reg-data-fim'].forEach(id => document.getElementById(id).value = '');
      ['reg-turno', 'reg-montagem', 'reg-dimensao', 'reg-tracos', 'reg-capacidade', 'reg-atraso'].forEach(id => document.getElementById(id).selectedIndex = 0);
      renderRegistro();
    });
    renderRegistro();
  }

  async function renderRegistro() {
    const busca = document.getElementById('reg-busca').value.toLowerCase();
    const turno = document.getElementById('reg-turno').value;
    const montagem = document.getElementById('reg-montagem').value;
    const dimensao = document.getElementById('reg-dimensao').value;
    const tracos = document.getElementById('reg-tracos').value;
    const capacidade = document.getElementById('reg-capacidade').value;
    const idBateria = document.getElementById('reg-id-bateria').value.toLowerCase();
    const atraso = document.getElementById('reg-atraso').value;
    const dataInicio = document.getElementById('reg-data-inicio').value;  // 'YYYY-MM-DD' ou ''
    const dataFim = document.getElementById('reg-data-fim').value;

    const s = await LW.getStats();
    let data = s.data;

    if (busca) data = data.filter(b =>
      b.id_bateria.toLowerCase().includes(busca) ||
      (b.motivo_atraso || '').toLowerCase().includes(busca)
    );
    if (idBateria) data = data.filter(b => b.id_bateria.toLowerCase().includes(idBateria));
    if (turno) data = data.filter(b => b.turno === turno);
    if (montagem) data = data.filter(b => b.tipo_montagem === montagem);
    if (dimensao) data = data.filter(b => b.dimensao === dimensao);
    if (tracos) data = data.filter(b => b.qtd_tracos === parseInt(tracos));
    if (capacidade) data = data.filter(b => b.capacidade === parseInt(capacidade));
    if (atraso) data = data.filter(b => b.houve_atraso === atraso);
    if (dataInicio) data = data.filter(b => b.data >= dataInicio);
    if (dataFim) data = data.filter(b => b.data <= dataFim);
    // Sort by date desc
    data = [...data].sort((a, b) => b.data.localeCompare(a.data) || b.inicio?.localeCompare(a.inicio || ''));

    const tbody = document.getElementById('registro-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--text-3);padding:30px">Nenhum registro encontrado</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(b => `
      <tr>
        <td class="mono">${b.data ? b.data.split('-').reverse().join('/') : '—'}</td>
        <td><span class="badge badge-gray">${b.turno || '—'}</span></td>
        <td>${b.dimensao || '—'}</td>
        <td>${b.capacidade || '—'}</td>
        <td>${b.id_bateria || '—'}</td>
        <td class="mono">${b.inicio ? LW.formatTime(b.inicio) : '—'}</td>
        <td class="mono">${b.fim ? LW.formatTime(b.fim) : '—'}</td>
        <td class="mono">${LW.formatDuration(b.tempo_min)}</td>
        <td>${b.qtd_tracos || 0}</td>
        <td>
          ${b.houve_atraso === 'SIM'
        ? `<span class="badge badge-red" title="${b.motivo_atraso || ''}">⚠ SIM</span>`
        : '<span class="badge badge-green">✓ NÃO</span>'}
        </td>
        <td>${b.motivo_atraso || '—'}</td>
        <td><span class="badge ${b.tipo_montagem === '2/P' ? 'badge-blue' : b.tipo_montagem === 'S/P' ? 'badge-green' : 'badge-amber'}">${b.tipo_montagem || '—'}</span></td>
        <td>${b.total_paineis || 0}</td>
        <td>${b.paineis_2p ? b.paineis_2p : 0}</td>
        <td>${b.paineis_sp ? b.paineis_sp : 0}</td>
        <td>${(b.m2_total || 0).toFixed(2)}</td>
        <td>${(b.m2_2p || 0).toFixed(2)}</td>
        <td>${(b.m2_sp || 0).toFixed(2)}</td>
        <td>${b.bercos_reais || '—'}</td>
      </tr>
    `).join('');
    document.getElementById('reg-count').textContent = data.length + ' registros';
  }
  function initRelatorio() {
    document.getElementById('btn-relatorio-filtrar').addEventListener('click', renderRelatorio);
    document.getElementById('rel-busca').addEventListener('input', renderRelatorio);
    ['rel-data-inicio', 'rel-data-fim', 'rel-id-bateria', 'rel-num-traco'].forEach(id => {
      document.getElementById(id).addEventListener('change', renderRelatorio);
    });
    document.getElementById('btn-relatorio-limpar').addEventListener('click', () => {
      ['rel-busca', 'rel-id-bateria', 'rel-data-inicio', 'rel-data-fim'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('rel-num-traco').selectedIndex = 0;
      renderRelatorio();
    });
    renderRelatorio();
  }

  async function renderRelatorio() {
    const tbody = document.getElementById('relatorio-tbody');
    if (!tbody) return;

    const busca = document.getElementById('rel-busca')?.value.toLowerCase() || '';
    const idBateria = document.getElementById('rel-id-bateria')?.value.toLowerCase() || '';
    const numTraco = document.getElementById('rel-num-traco')?.value || '';
    const dataInicio = document.getElementById('rel-data-inicio')?.value || '';
    const dataFim = document.getElementById('rel-data-fim')?.value || '';

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:20px">Carregando...</td></tr>`;

    let linhas = await LW.getRelatorioInjecao();

    if (busca) linhas = linhas.filter(l => (l.obs || '').toLowerCase().includes(busca) || (l.id_bateria || '').toLowerCase().includes(busca));
    if (idBateria) linhas = linhas.filter(l => (l.id_bateria || '').toLowerCase().includes(idBateria));
    if (numTraco) linhas = linhas.filter(l => l.num_traco === parseInt(numTraco));
    if (dataInicio) linhas = linhas.filter(l => l.data >= dataInicio);
    if (dataFim) linhas = linhas.filter(l => l.data <= dataFim);

    if (!linhas.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-3);padding:30px">Nenhum registro encontrado</td></tr>`;
      document.getElementById('rel-count').textContent = '0 registros';
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
        <td>${l.obs || '—'}</td>
      </tr>
    `).join('');
    document.getElementById('rel-count').textContent = linhas.length + ' registros';
  }

  // ---- Export CSV ----

  const EXPORT_COLUNAS = [
    { campo: 'data',          header: 'Data',             padrao: true,  fmt: v => v ? v.split('-').reverse().join('/') : '' },
    { campo: 'turno',         header: 'Turno',            padrao: true  },
    { campo: 'id_bateria',    header: 'ID Bateria',       padrao: true  },
    { campo: 'dimensao',      header: 'Dimensão',         padrao: true  },
    { campo: 'capacidade',    header: 'Cap. Berços',      padrao: true  },
    { campo: 'tipo_montagem', header: 'Tipo Montagem',    padrao: true  },
    { campo: 'inicio',        header: 'Hora Início',      padrao: true,  fmt: v => { if (!v) return ''; const d = new Date(v); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } },
    { campo: 'fim',           header: 'Hora Fim',         padrao: true,  fmt: v => { if (!v) return ''; const d = new Date(v); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } },
    { campo: 'tempo_min',     header: 'Duração (min)',    padrao: true,  fmt: v => v ? String(Math.round(v)) : '0' },
    { campo: 'qtd_tracos',    header: 'Qtd Traços',       padrao: true  },
    { campo: 'houve_atraso',  header: 'Houve Atraso',     padrao: true  },
    { campo: 'motivo_atraso', header: 'Motivo Atraso',    padrao: true  },
    { campo: 'silo',          header: 'Silo EPS',         padrao: false },
    { campo: 'expansao',      header: 'Expansão EPS',     padrao: false },
    { campo: 'bercos_reais',  header: 'Berços Reais',     padrao: true  },
    { campo: 'total_paineis', header: 'Total Painéis',    padrao: true  },
    { campo: 'paineis_2p',    header: 'Painéis 2/P',      padrao: true  },
    { campo: 'paineis_sp',    header: 'Painéis S/P',      padrao: true  },
    { campo: 'm2_total',      header: 'm² Total',         padrao: true,  fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0' },
    { campo: 'm2_2p',         header: 'm² 2/P',           padrao: false, fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0' },
    { campo: 'm2_sp',         header: 'm² S/P',           padrao: false, fmt: v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : '0' },
  ];

  function escaparCelula(valor) {
    const str = valor !== undefined && valor !== null ? String(valor) : '';
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function gerarDownloadCSV(dados, colsSel, sufixo) {
    const cabecalho = colsSel.map(c => escaparCelula(c.header)).join(';');
    const linhas = dados.map(b =>
      colsSel.map(({ campo, fmt }) => {
        const v = b[campo];
        const val = fmt ? fmt(v) : (v !== undefined && v !== null ? String(v) : '');
        return escaparCelula(val);
      }).join(';')
    );
    const csv = 'sep=;\r\n' + [cabecalho, ...linhas].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lightwall_baterias_' + sufixo + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Compatibilidade — exporta tudo com colunas padrão
  async function exportCSV() {
    const s = await LW.getStats();
    gerarDownloadCSV(s.data, EXPORT_COLUNAS.filter(c => c.padrao), new Date().toISOString().split('T')[0]);
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
    gerarDownloadCSV(dados, colsSel, sufixo);
    fecharExportModal();
  }

  // ---- Public ----
  window.LWDash = {
    initDashboard, initTurnos, initRegistro, initRelatorio, renderRelatorio,
    exportCSV, abrirExportModal, fecharExportModal, onExportPeriodoChange,
    selecionarTodasColunas, atualizarPreviewCount, confirmarExport,
  };
})();