// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  qualidade-tracos.js — Dashboard de Qualidade dos Traços
//
//  Indicadores:
//   1. Taxa de Acerto da Receita
//   2. Materiais Mais Ajustados
//   3. Receitas Mais Instáveis
//   4. Consumo Planejado × Real
//   5. Média de Ajustes por Traço
//   6. Evolução da Qualidade (mensal)
//   7. Distribuição dos Ajustes (donut)
// ============================================================

'use strict';

(function () {

  // ----------------------------------------------------------------
  //  INSUMOS CONHECIDOS — extensível: novos insumos aparecerão
  //  automaticamente se seguirem a estrutura { original, ajustes, total }
  // ----------------------------------------------------------------
  const INSUMOS_LABELS = {
    cimento_real: 'Cimento',
    agua_real: 'Água',
    eps_real: 'EPS',
    superplast_real: 'Superplastificante',
    incorporador_real: 'Incorporador de Ar',
  };

  // Insumos que NÃO são de receita (excluídos dos cálculos de consumo/ajuste)
  const INSUMOS_EXCLUIDOS = new Set(['densidade_insumo', 'flow_insumo']);

  // ----------------------------------------------------------------
  //  NORMALIZA um campo de insumo — garante compatibilidade retroativa
  //  Campos antigos (número ou string) → { original, ajustes: [], total }
  // ----------------------------------------------------------------
  function normalizarInsumo(val) {
    if (val === null || val === undefined || val === '') {
      return { original: '', ajustes: [], total: '' };
    }
    if (typeof val === 'object' && 'ajustes' in val) {
      // Já no novo formato
      const ajustes = Array.isArray(val.ajustes) ? val.ajustes : [];
      const original = val.original !== undefined ? val.original : '';
      const total = val.total !== undefined
        ? val.total
        : (ajustes.length > 0
            ? ajustes.reduce((s, v) => s + (parseFloat(v) || 0), parseFloat(original) || 0)
            : original);
      return { original, ajustes, total };
    }
    // Formato antigo: valor simples
    return { original: val, ajustes: [], total: val };
  }

  // ----------------------------------------------------------------
  //  EXTRAI todos os traços do historico.json com filtros aplicados
  // ----------------------------------------------------------------
  async function getTracosComFiltros(filtros) {
    const baterias = await fetch('historico.json').then(r => r.json());

    const dataInicio = filtros.dataInicio || null;
    const dataFim    = filtros.dataFim    || null;
    const bateria    = filtros.bateria    || '';
    const turno      = filtros.turno      || '';
    const tipoMontagem = filtros.tipoMontagem || '';

    const tracosFiltrados = [];

    for (const bat of baterias) {
      // Filtros de bateria
      if (dataInicio && bat.data < dataInicio) continue;
      if (dataFim    && bat.data > dataFim)    continue;
      if (bateria    && bat.id_bateria !== bateria) continue;
      if (turno      && bat.turno !== turno)        continue;
      if (tipoMontagem && bat.tipo_montagem !== tipoMontagem) continue;

      const tracosArr = Array.isArray(bat.tracos) ? bat.tracos : [];
      for (const t of tracosArr) {
        tracosFiltrados.push({
          ...t,
          // Contexto da bateria
          _data:           bat.data         || '',
          _id_bateria:     bat.id_bateria   || '',
          _turno:          bat.turno        || '',
          _tipo_montagem:  bat.tipo_montagem || '',
          _dimensao:       bat.dimensao     || '',
        });
      }
    }

    return tracosFiltrados;
  }

  // ----------------------------------------------------------------
  //  CALCULA todos os indicadores a partir dos traços filtrados
  // ----------------------------------------------------------------
  function calcularIndicadores(tracos) {
    const totalTracos = tracos.length;

    let totalAjustesGeral = 0;
    let tracosComAjuste   = 0;
    const ajustesPorInsumo = {};   // { nomeInsumo: count }
    const tracosAjustadosPorTipo = {}; // { tipo_montagem: { total, ajustados } }
    const consumoPorInsumo = {};   // { nomeInsumo: { planejado, real } }
    const evolucao = {};           // { 'YYYY-MM': { total, ajustados } }

    for (const t of tracos) {
      let tracoTemAjuste = false;

      // Identifica todos os campos que têm estrutura de insumo
      const camposInsumo = Object.keys(t).filter(k => {
        if (k.startsWith('_')) return false;
        if (INSUMOS_EXCLUIDOS.has(k)) return false;
        const v = t[k];
        return typeof v === 'object' && v !== null && 'ajustes' in v;
      });

      // Inclui também campos conhecidos que estejam no formato antigo
      const camposConhecidos = Object.keys(INSUMOS_LABELS);
      const todosCampos = new Set([...camposInsumo, ...camposConhecidos]);

      for (const campo of todosCampos) {
        if (INSUMOS_EXCLUIDOS.has(campo)) continue;
        const raw = t[campo];
        if (raw === undefined) continue;

        const insumo = normalizarInsumo(raw);
        const nAjustes = insumo.ajustes.length;
        const label = INSUMOS_LABELS[campo] || campo;

        // Contabiliza ajustes por insumo
        if (nAjustes > 0) {
          ajustesPorInsumo[label] = (ajustesPorInsumo[label] || 0) + nAjustes;
          totalAjustesGeral += nAjustes;
          tracoTemAjuste = true;
        }

        // Consumo planejado × real (apenas se tiver valor numérico)
        const original = parseFloat(insumo.original);
        const total    = parseFloat(insumo.total);
        if (!isNaN(original) && !isNaN(total)) {
          if (!consumoPorInsumo[label]) consumoPorInsumo[label] = { planejado: 0, real: 0 };
          consumoPorInsumo[label].planejado += original;
          consumoPorInsumo[label].real      += total;
        }
      }

      if (tracoTemAjuste) tracosComAjuste++;

      // Receitas instáveis por tipo de montagem
      const tipo = t._tipo_montagem || 'Desconhecido';
      if (!tracosAjustadosPorTipo[tipo]) tracosAjustadosPorTipo[tipo] = { total: 0, ajustados: 0 };
      tracosAjustadosPorTipo[tipo].total++;
      if (tracoTemAjuste) tracosAjustadosPorTipo[tipo].ajustados++;

      // Evolução mensal
      if (t._data && t._data.length >= 7) {
        const mesAno = t._data.substring(0, 7); // YYYY-MM
        if (!evolucao[mesAno]) evolucao[mesAno] = { total: 0, ajustados: 0 };
        evolucao[mesAno].total++;
        if (tracoTemAjuste) evolucao[mesAno].ajustados++;
      }
    }

    const tracosSemAjuste = totalTracos - tracosComAjuste;
    const taxaAcerto = totalTracos > 0 ? Math.round((tracosSemAjuste / totalTracos) * 100) : 0;
    const mediaAjustes = totalTracos > 0 ? (totalAjustesGeral / totalTracos) : 0;

    // Ranking materiais (ordenado por total de ajustes desc)
    const rankingMateriais = Object.entries(ajustesPorInsumo)
      .sort((a, b) => b[1] - a[1]);

    // Ranking receitas instáveis (por % ajustados desc)
    const rankingReceitas = Object.entries(tracosAjustadosPorTipo)
      .map(([tipo, v]) => ({
        tipo,
        pct: v.total > 0 ? Math.round((v.ajustados / v.total) * 100) : 0,
        total: v.total,
        ajustados: v.ajustados,
      }))
      .sort((a, b) => b.pct - a.pct);

    return {
      totalTracos,
      tracosSemAjuste,
      tracosComAjuste,
      taxaAcerto,
      totalAjustesGeral,
      mediaAjustes,
      rankingMateriais,
      rankingReceitas,
      consumoPorInsumo,
      evolucao,
    };
  }

  // ----------------------------------------------------------------
  //  RENDER HELPERS
  // ----------------------------------------------------------------

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderTaxaAcerto(ind) {
    setText('qt-total-tracos', ind.totalTracos.toLocaleString('pt-BR'));
    setText('qt-sem-ajuste',   ind.tracosSemAjuste.toLocaleString('pt-BR'));
    setText('qt-com-ajuste',   ind.tracosComAjuste.toLocaleString('pt-BR'));
    setText('qt-taxa-acerto',  ind.taxaAcerto + '%');

    const bar = document.getElementById('qt-taxa-bar');
    if (bar) bar.style.width = ind.taxaAcerto + '%';

    // Cor dinâmica na barra
    if (bar) {
      if (ind.taxaAcerto >= 80) {
        bar.style.background = 'linear-gradient(90deg,#10b981,#34d399)';
      } else if (ind.taxaAcerto >= 50) {
        bar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
      } else {
        bar.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
      }
    }
  }

  function renderMediaAjustes(ind) {
    setText('qt-media-ajustes',    ind.mediaAjustes.toFixed(2).replace('.', ','));
    setText('qt-total-ajustes-num', ind.totalAjustesGeral.toLocaleString('pt-BR'));
  }

  function renderDonut(ind) {
    const canvas = document.getElementById('qt-donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 110;
    canvas.width = size; canvas.height = size;
    const cx = size / 2, cy = size / 2, r = 44, inner = 26;

    const segments = [ind.tracosSemAjuste, ind.tracosComAjuste];
    const colors   = ['#10b981', '#f59e0b'];
    const total    = segments.reduce((s, v) => s + v, 0);

    if (!total) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2f3a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fillStyle = '#1e2229';
      ctx.fill();
      return;
    }

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
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#1e2229';
    ctx.fill();

    setText('qt-donut-sem', ind.tracosSemAjuste.toLocaleString('pt-BR'));
    setText('qt-donut-com', ind.tracosComAjuste.toLocaleString('pt-BR'));
  }

  function renderRankingMateriais(ind) {
    const el = document.getElementById('qt-ranking-materiais');
    if (!el) return;

    if (!ind.rankingMateriais.length) {
      el.innerHTML = '<div style="color:var(--text-3);font-size:.84rem;text-align:center;padding:20px 0">Nenhum ajuste registrado no período</div>';
      return;
    }

    const maxVal = ind.rankingMateriais[0][1];
    const medals = ['🥇', '🥈', '🥉'];

    el.innerHTML = ind.rankingMateriais.map(([label, count], i) => {
      const pct = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
      const medal = medals[i] || `${i + 1}º`;
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:.84rem;color:var(--text-2)">${medal} ${label}</span>
            <span style="font-family:var(--font-mono);font-size:.84rem;font-weight:700;color:var(--accent)">${count.toLocaleString('pt-BR')} ajuste${count !== 1 ? 's' : ''}</span>
          </div>
          <div style="background:var(--bg-3);border-radius:4px;height:5px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width .4s"></div>
          </div>
        </div>`;
    }).join('');
  }

  function renderRankingReceitas(ind) {
    const el = document.getElementById('qt-ranking-receitas');
    if (!el) return;

    if (!ind.rankingReceitas.length) {
      el.innerHTML = '<div style="color:var(--text-3);font-size:.84rem;text-align:center;padding:20px 0">Sem dados no período</div>';
      return;
    }

    el.innerHTML = ind.rankingReceitas.map(r => {
      let cor = '#10b981';
      if (r.pct > 30) cor = '#ef4444';
      else if (r.pct > 15) cor = '#f59e0b';

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;
          padding:10px 12px;border-radius:8px;background:var(--bg-2);margin-bottom:8px;
          border-left:3px solid ${cor}">
          <div>
            <div style="font-size:.88rem;font-weight:600;color:var(--text)">${r.tipo}</div>
            <div style="font-size:.74rem;color:var(--text-3);margin-top:2px">${r.ajustados} de ${r.total} traços ajustados</div>
          </div>
          <div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:800;color:${cor}">${r.pct}%</div>
        </div>`;
    }).join('');
  }

  function renderConsumo(ind) {
    const el = document.getElementById('qt-consumo-grid');
    if (!el) return;

    const insumos = Object.entries(ind.consumoPorInsumo);
    if (!insumos.length) {
      el.innerHTML = '<div style="color:var(--text-3);font-size:.84rem">Nenhum dado de consumo disponível no período</div>';
      return;
    }

    el.innerHTML = insumos.map(([label, v]) => {
      const diff = v.real - v.planejado;
      const pct  = v.planejado > 0 ? ((diff / v.planejado) * 100).toFixed(1) : '—';
      const cor  = diff > 0 ? '#ef4444' : diff < 0 ? '#10b981' : 'var(--text-3)';
      const sinal = diff > 0 ? '+' : '';
      const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

      return `
        <div style="background:var(--bg-2);border-radius:10px;padding:14px;border:1px solid var(--border)">
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:8px">${label}</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:.75rem;color:var(--text-3)">Planejado</span>
              <span style="font-family:var(--font-mono);font-size:.82rem;color:var(--text-2)">${fmt(v.planejado)}</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="font-size:.75rem;color:var(--text-3)">Real</span>
              <span style="font-family:var(--font-mono);font-size:.82rem;color:var(--text-2)">${fmt(v.real)}</span>
            </div>
            <div style="border-top:1px solid var(--border);padding-top:5px;margin-top:2px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:.75rem;color:var(--text-3)">Diferença</span>
              <span style="font-family:var(--font-mono);font-size:.9rem;font-weight:700;color:${cor}">${sinal}${fmt(diff)}${pct !== '—' ? ` (${sinal}${pct}%)` : ''}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function renderEvolucao(ind) {
    const canvas = document.getElementById('qt-evolucao-chart');
    if (!canvas) return;

    const meses = Object.keys(ind.evolucao).sort();
    if (!meses.length) {
      const ctx = canvas.getContext('2d');
      const W = canvas.width = canvas.offsetWidth || 600;
      const H = canvas.height = 160;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'var(--text-3)';
      ctx.font = '13px Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sem dados para exibir', W / 2, H / 2);
      return;
    }

    const valores = meses.map(m => {
      const v = ind.evolucao[m];
      return v.total > 0 ? Math.round((v.ajustados / v.total) * 100) : 0;
    });

    const labels = meses.map(m => {
      const [y, mo] = m.split('-');
      const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      return nomes[parseInt(mo) - 1] + (y !== new Date().getFullYear().toString() ? `/${y.slice(2)}` : '');
    });

    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth || 600;
    const H = canvas.height = 160;
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 20, right: 16, bottom: 28, left: 42 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = Math.max(...valores, 10);

    // Grid + eixo Y
    ctx.strokeStyle = '#2a2f3a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + chartH * (1 - i / 4);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = '#5c6475';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 4) + '%', pad.left - 5, y + 3);
    }

    if (meses.length < 2) {
      // Único ponto: render como barra
      const x = pad.left + chartW / 2 - 20;
      const bH = (valores[0] / maxVal) * chartH;
      ctx.fillStyle = '#f59e0b';
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, pad.top + chartH - bH, 40, bH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#5c6475';
      ctx.font = '9px Barlow, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[0], pad.left + chartW / 2, H - 4);
      return;
    }

    // Linha
    const pts = meses.map((_, i) => ({
      x: pad.left + (i / (meses.length - 1)) * chartW,
      y: pad.top + chartH - (valores[i] / maxVal) * chartH,
    }));

    // Área sob a linha
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + chartH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, pad.top + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    grad.addColorStop(0, 'rgba(245,158,11,0.25)');
    grad.addColorStop(1, 'rgba(245,158,11,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Linha
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pontos
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // Valor acima
      ctx.fillStyle = '#d1d5db';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(valores[i] + '%', p.x, p.y - 8);

      // Label eixo X
      ctx.fillStyle = '#5c6475';
      ctx.font = '9px Barlow, sans-serif';
      const step = Math.max(1, Math.floor(labels.length / 10));
      if (i % step === 0) ctx.fillText(labels[i], p.x, H - 4);
    });
  }

  // ----------------------------------------------------------------
  //  POPULA filtros dinâmicos (baterias + tipos de montagem)
  // ----------------------------------------------------------------
  async function popularFiltros() {
    try {
      const baterias = await fetch('historico.json').then(r => r.json());

      const ids   = [...new Set(baterias.map(b => b.id_bateria).filter(Boolean))].sort();
      const tipos = [...new Set(baterias.map(b => b.tipo_montagem).filter(Boolean))].sort();

      const selBat = document.getElementById('qt-bateria');
      if (selBat) {
        selBat.innerHTML = '<option value="">Todas</option>';
        ids.forEach(id => {
          const o = document.createElement('option');
          o.value = o.textContent = id;
          selBat.appendChild(o);
        });
      }

      const selTipo = document.getElementById('qt-tipo-montagem');
      if (selTipo) {
        selTipo.innerHTML = '<option value="">Todos</option>';
        tipos.forEach(t => {
          const o = document.createElement('option');
          o.value = o.textContent = t;
          selTipo.appendChild(o);
        });
      }
    } catch (_) {}
  }

  // ----------------------------------------------------------------
  //  LEITURA DOS FILTROS DA UI
  // ----------------------------------------------------------------
  function lerFiltros() {
    return {
      dataInicio:    document.getElementById('qt-data-inicio')?.value  || '',
      dataFim:       document.getElementById('qt-data-fim')?.value     || '',
      bateria:       document.getElementById('qt-bateria')?.value      || '',
      turno:         document.getElementById('qt-turno')?.value        || '',
      tipoMontagem:  document.getElementById('qt-tipo-montagem')?.value || '',
    };
  }

  // ----------------------------------------------------------------
  //  RENDER PRINCIPAL
  // ----------------------------------------------------------------
  async function render() {
    const filtros = lerFiltros();
    const tracos  = await getTracosComFiltros(filtros);
    const ind     = calcularIndicadores(tracos);

    renderTaxaAcerto(ind);
    renderMediaAjustes(ind);
    requestAnimationFrame(() => {
      renderDonut(ind);
      renderEvolucao(ind);
    });
    renderRankingMateriais(ind);
    renderRankingReceitas(ind);
    renderConsumo(ind);
  }

  // ----------------------------------------------------------------
  //  INICIALIZAÇÃO
  // ----------------------------------------------------------------
  function init() {
    // Datas padrão: últimos 30 dias
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const ini   = document.getElementById('qt-data-inicio');
    const fim   = document.getElementById('qt-data-fim');
    if (ini && !ini.value) ini.value = d30;
    if (fim && !fim.value) fim.value = today;

    document.getElementById('btn-qt-filtrar')
      ?.addEventListener('click', render);

    popularFiltros().then(() => render());
  }

  // ---- Public API ----
  window.LWQualidade = { init, render };

})();
