// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  debriefing.js — "Debriefing do Dia"
//
//  Seção 100% somente-leitura. Gera um relatório operacional em
//  formato de bloco de notas a partir dos dados JÁ REGISTRADOS:
//    - public/historico.json        (baterias/operações)
//    - public/relatorio_injecao.json (traços: flow, densidade,
//      berços, observações, reaproveitamentos)
//
//  Não cria, não edita e não apaga nenhum dado. Não interfere em
//  regras de negócio, dashboards ou no fluxo de registro de
//  operações — apenas lê e exibe.
// ============================================================

'use strict';

(function () {

  const $ = id => document.getElementById(id);

  // ---- Data de hoje (Brasília), no formato YYYY-MM-DD ----
  function todayBrasiliaLocal() {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return fmt.format(now); // já vem como YYYY-MM-DD
  }

  function horaBrasilia(isoString) {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
      });
    } catch (_) { return '—'; }
  }

  // ---- Normaliza campos que podem ser número, string ou {original, ajustes[], total} ----
  function valorFinal(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'object') {
      if (v.total !== undefined && v.total !== '') return parseFloat(v.total);
      const ajustes = Array.isArray(v.ajustes) ? v.ajustes : [];
      const base = parseFloat(v.original);
      if (ajustes.length) {
        return ajustes.reduce((s, a) => s + (parseFloat(a) || 0), isNaN(base) ? 0 : base);
      }
      return isNaN(base) ? null : base;
    }
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function fmtNum(n, casas) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Busca dados brutos (somente leitura) ----
  async function carregarDados() {
    const [historico, relatorio] = await Promise.all([
      fetch('historico.json').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('relatorio_injecao.json').then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    return { historico: Array.isArray(historico) ? historico : [], relatorio: Array.isArray(relatorio) ? relatorio : [] };
  }

  // ---- Monta a estrutura do dia: baterias do dia + traços vinculados a cada operação ----
  function montarEstruturaDoDia(historico, relatorio, data) {
    const baterias = historico
      .filter(b => b.data === data)
      .sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));

    // Para cada operação (bateria registrada), localizar os traços usados nela
    // dentro de relatorio_injecao.json (via ultilizado.operacao[].id_operacao)
    const baterasComTracos = baterias.map(bateria => {
      const tracosDaOperacao = [];

      relatorio.forEach(traco => {
        const usos = (traco.ultilizado && Array.isArray(traco.ultilizado.operacao))
          ? traco.ultilizado.operacao
          : [];
        usos.forEach(uso => {
          if (uso.id_operacao === bateria.id) {
            const reaproveitado = usos.length > 1;
            // Origem = primeira operação que usou esse traço (se for diferente da atual)
            const usoOrigem = usos[0];
            tracosDaOperacao.push({
              num_traco: traco.num_traco,
              flow: valorFinal(traco.flow),
              densidade: valorFinal(traco.densidade),
              densidade_eps: valorFinal(traco.densidade_eps),
              berco_inicio: uso.berco_inicio,
              berco_fim: uso.berco_finalizacao,
              obs: (traco.obs || '').trim(),
              reaproveitado,
              origem_operacao: reaproveitado ? usoOrigem.id_operacao : null,
              origem_bateria: reaproveitado ? usoOrigem.id_bateria : null,
            });
          }
        });
      });

      tracosDaOperacao.sort((a, b) => (a.num_traco || 0) - (b.num_traco || 0));

      return { bateria, tracos: tracosDaOperacao };
    });

    return baterasComTracos;
  }

  // ---- Calcula cabeçalho agregado do dia ----
  function calcularCabecalho(estrutura) {
    const qtdBaterias = estrutura.length;
    let qtdTracos = 0;
    const densidadesEps = [];

    estrutura.forEach(({ tracos }) => {
      qtdTracos += tracos.length;
      tracos.forEach(t => {
        if (t.densidade_eps !== null) densidadesEps.push(t.densidade_eps);
      });
    });

    const mediaTracosPorBateria = qtdBaterias ? (qtdTracos / qtdBaterias) : 0;

    // EPS "predominante" do dia = moda (valor mais frequente); empate → média
    let epsPredominante = null;
    if (densidadesEps.length) {
      const contagem = {};
      densidadesEps.forEach(v => { contagem[v] = (contagem[v] || 0) + 1; });
      const maxFreq = Math.max(...Object.values(contagem));
      const maisFrequentes = Object.keys(contagem).filter(k => contagem[k] === maxFreq).map(Number);
      epsPredominante = maisFrequentes.length === 1
        ? maisFrequentes[0]
        : (maisFrequentes.reduce((a, b) => a + b, 0) / maisFrequentes.length);
    }

    return { qtdBaterias, qtdTracos, mediaTracosPorBateria, epsPredominante };
  }

  // ---- Renderiza o relatório em texto (bloco de notas) ----
  function renderRelatorio(estrutura, data) {
    const cab = calcularCabecalho(estrutura);

    const dataFmt = (() => {
      try {
        const [y, m, d] = data.split('-');
        return `${d}/${m}/${y}`;
      } catch (_) { return data; }
    })();

    const linhas = [];
    const sep = () => linhas.push(`<span class="dbf-sep">────────────────────────────</span>`);

    linhas.push(`<span class="dbf-titulo">RELATÓRIO DE PRODUÇÃO - ${dataFmt}</span>`);
    linhas.push('');
    linhas.push(`EPS: ${cab.epsPredominante !== null ? fmtNum(cab.epsPredominante, 0) + ' kg/m³' : '—'}`);
    linhas.push(`Baterias injetadas: ${cab.qtdBaterias}`);
    linhas.push(`Total de traços: ${cab.qtdTracos}`);
    linhas.push(`Média de traços por bateria: ${cab.qtdBaterias ? fmtNum(cab.mediaTracosPorBateria, 1) : '—'}`);

    const ocorrencias = [];
    const reaproveitados = [];

    if (!estrutura.length) {
      sep();
      linhas.push('<span class="dbf-vazio">Nenhuma operação registrada para esta data.</span>');
    }

    estrutura.forEach(({ bateria, tracos }) => {
      sep();
      linhas.push(`<span class="dbf-secao">BATERIA ${escapeHtml(bateria.id_bateria || '—')}</span>`);
      linhas.push(`Início: ${horaBrasilia(bateria.inicio)}`);
      linhas.push(`Fim: ${horaBrasilia(bateria.fim)}`);

      if (!tracos.length) {
        linhas.push('<span class="dbf-vazio">Sem traços registrados.</span>');
      }

      tracos.forEach((t, idx) => {
        linhas.push('');
        linhas.push(`Traço ${t.num_traco !== undefined && t.num_traco !== null ? t.num_traco : (idx + 1)}`);
        linhas.push(`Flow/Densidade: ${t.flow !== null ? fmtNum(t.flow, 0) : '—'} / ${t.densidade !== null ? fmtNum(t.densidade, 0) : '—'}`);
        const bercoIni = t.berco_inicio || '—';
        const bercoFim = t.berco_fim || '—';
        linhas.push(`Berços: ${escapeHtml(bercoIni)} ao ${escapeHtml(bercoFim)}`);

        if (t.obs) {
          linhas.push(`Observações:`);
          linhas.push(`• ${escapeHtml(t.obs)}`);
          ocorrencias.push(t.obs);
        }

        if (t.reaproveitado) {
          linhas.push(`♻ Traço reaproveitado`);
          linhas.push(`Origem: Operação ${escapeHtml(t.origem_bateria || t.origem_operacao || '—')} Traço ${t.num_traco !== undefined ? t.num_traco : '—'}`);
          reaproveitados.push(t);
        }
      });
    });

    sep();
    linhas.push(`<span class="dbf-secao">PRINCIPAIS OCORRÊNCIAS</span>`);
    if (ocorrencias.length) {
      ocorrencias.forEach(o => linhas.push(`• ${escapeHtml(o)}`));
    } else {
      linhas.push('<span class="dbf-vazio">Nenhuma ocorrência registrada hoje.</span>');
    }

    if (reaproveitados.length) {
      sep();
      linhas.push(`<span class="dbf-secao">TRAÇOS REAPROVEITADOS</span>`);
      reaproveitados.forEach(t => {
        linhas.push(`♻ Traço ${t.num_traco !== undefined ? t.num_traco : '—'} — Origem: Operação ${escapeHtml(t.origem_bateria || t.origem_operacao || '—')}`);
      });
    }

    return linhas.join('\n');
  }

  // ---- Atualiza o conteúdo do popover (chamado toda vez que abre) ----
  async function atualizarConteudo() {
    const el = $('debriefing-content');
    if (!el) return;
    try {
      const { historico, relatorio } = await carregarDados();
      const hoje = todayBrasiliaLocal();
      const estrutura = montarEstruturaDoDia(historico, relatorio, hoje);
      el.innerHTML = renderRelatorio(estrutura, hoje);
    } catch (e) {
      el.innerHTML = '<span class="dbf-vazio">Não foi possível carregar o debriefing do dia.</span>';
    }
  }

  // ---- API pública: abre/fecha o popover usando o mesmo mecanismo já existente ----
  window.LWDebriefing = {
    toggle(event) {
      if (event) event.stopPropagation();
      const el = $('popover-debriefing');
      if (!el) return;
      const wasActive = el.classList.contains('active');
      document.querySelectorAll('.ao-popover').forEach(p => p.classList.remove('active'));
      if (!wasActive) {
        el.classList.add('active');
        atualizarConteudo();
      }
    }
  };

})();
