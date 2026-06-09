// ============================================================
//  LIGHTWALL SC — SISTEMA DE INJEÇÃO
//  ajustes-receita.js — Registro de Ajustes na Receita
// ============================================================

'use strict';

(function () {

  // ---- State ----
  let ajustes = [];
  let materiais_temp = []; // Materiais do formulário atual

  // ---- DOM refs ----
  const $ = id => document.getElementById(id);

  // ---- Inicialização ----
  function init() {
    LW.loadConfig().then(() => {
      carregarAjustes();
      populateSelects();
      wireEvents();
      renderHistorico();
      setInterval(updateClock, 1000);
      updateClock();
    });
  }

  // Carrega ajustes do localStorage
  function carregarAjustes() {
    const saved = localStorage.getItem('ajustes_receita');
    ajustes = saved ? JSON.parse(saved) : [];
  }

  // Limpa o histórico de traços (útil para resolver problemas de dados duplicados)
  window.limparHistoricoTracos = function () {
    if (confirm('Deseja realmente apagar todo o histórico de traços salvos no navegador?')) {
      localStorage.removeItem('relatorio_injeccao');
      populateSelects();
      alert('Histórico de traços removido com sucesso!');
    }
  };

  // Salva ajustes no localStorage
  function salvarAjustes() {
    localStorage.setItem('ajustes_receita', JSON.stringify(ajustes));
  }

  // Preenche os selects
  function populateSelects() {
    // ID da bateria
    const selBateria = $('ajuste-bateria-id');
    selBateria.innerHTML = '<option selected disabled hidden>Selecione...</option>';
    LW.BATERIA_IDS.forEach(id => {
      const opt = document.createElement('option');
      opt.value = id.id;
      opt.textContent = id.id;
      selBateria.appendChild(opt);
    });

    // Traço original (carregado do histórico de traços)
    const selTraco = $('ajuste-traco-original');
    selTraco.innerHTML = '<option selected disabled hidden>Selecione...</option>';
    
    // Busca traços do histórico
    const historico = localStorage.getItem('relatorio_injeccao');
    if (historico) {
      try {
        const tracos = JSON.parse(historico);
        tracos.forEach((t, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `Traço ${idx + 1} - ${t.bateria_id || 'N/A'} (${t.data_hora || 'N/A'})`;
          selTraco.appendChild(opt);
        });
      } catch (e) {
        console.error('Erro ao carregar traços:', e);
      }
    }
  }

  // Configura eventos
  function wireEvents() {
    // Atualizar data/hora atual ao abrir a página
    $('ajuste-data-hora').addEventListener('focus', () => {
      if (!$('ajuste-data-hora').value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        $('ajuste-data-hora').value = now.toISOString().slice(0, 16);
      }
    });

    // Sync de bateria entre seleções
    $('ajuste-bateria-id').addEventListener('change', () => {
      populateSelects(); // Recarrega traços se necessário
    });
  }

  // Adiciona material ao formulário
  window.adicionarMaterialAjuste = function () {
    const container = $('ajuste-materiais-container');
    const idx = materiais_temp.length;

    const material = {
      id: idx,
      nome: '',
      quantidade: '',
      unidade: 'g'
    };
    materiais_temp.push(material);

    const materialDiv = document.createElement('div');
    materialDiv.id = `material-${idx}`;
    materialDiv.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;align-items:end;margin-bottom:12px;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)';

    materialDiv.innerHTML = `
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:.85rem">Nome do Material</label>
        <input class="form-input" type="text" 
          data-material-idx="${idx}" 
          onchange="atualizarMaterial(${idx}, 'nome', this.value)"
          placeholder="Ex: Poliéster, Catalisador, Água...">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:.85rem">Quantidade</label>
        <input class="form-input" type="number" step="0.01"
          data-material-idx="${idx}"
          onchange="atualizarMaterial(${idx}, 'quantidade', this.value)"
          placeholder="0.00">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label" style="font-size:.85rem">Unidade</label>
        <select class="form-input"
          data-material-idx="${idx}"
          onchange="atualizarMaterial(${idx}, 'unidade', this.value)">
          <option>g</option>
          <option>kg</option>
          <option>ml</option>
          <option>l</option>
          <option>%</option>
        </select>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="removerMaterialAjuste(${idx})">✕</button>
    `;

    container.appendChild(materialDiv);
  };

  // Atualiza dados de material
  window.atualizarMaterial = function (idx, campo, valor) {
    if (materiais_temp[idx]) {
      materiais_temp[idx][campo] = valor;
    }
  };

  // Remove material da lista
  window.removerMaterialAjuste = function (idx) {
    const el = $(`material-${idx}`);
    if (el) el.remove();
    materiais_temp = materiais_temp.filter(m => m.id !== idx);
  };

  // Limpa formulário
  window.limparFormularioAjuste = function () {
    $('ajuste-bateria-id').value = '';
    $('ajuste-traco-original').value = '';
    $('ajuste-data-hora').value = '';
    $('ajuste-motivo').value = '';
    $('ajuste-descricao-problema').value = '';
    $('ajuste-tempo-adicional').value = '0';
    
    $('ajuste-densidade-antes').value = '';
    $('ajuste-flow-antes').value = '';
    $('ajuste-dens-eps-antes').value = '';
    $('ajuste-expansao-antes').value = '';
    
    $('ajuste-densidade-depois').value = '';
    $('ajuste-flow-depois').value = '';
    $('ajuste-dens-eps-depois').value = '';
    $('ajuste-expansao-depois').value = '';

    // Limpa materiais
    $('ajuste-materiais-container').innerHTML = '';
    materiais_temp = [];
  };

  // Salva novo ajuste
  window.salvarAjusteReceita = function () {
    // Validações
    const bateria_id = $('ajuste-bateria-id').value;
    const traco_idx = $('ajuste-traco-original').value;
    const data_hora = $('ajuste-data-hora').value;
    const motivo = $('ajuste-motivo').value;

    if (!bateria_id || !traco_idx || !data_hora || !motivo) {
      alert('Por favor, preencha os campos obrigatórios (*)');
      return;
    }

    // Cria objeto de ajuste
    const novoAjuste = {
      id: Date.now(),
      bateria_id,
      traco_idx: parseInt(traco_idx),
      data_hora,
      motivo,
      descricao_problema: $('ajuste-descricao-problema').value,
      tempo_adicional: parseInt($('ajuste-tempo-adicional').value) || 0,
      materiais: materiais_temp.slice(), // Cópia dos materiais
      resultados_antes: {
        densidade: parseFloat($('ajuste-densidade-antes').value) || null,
        flow: parseFloat($('ajuste-flow-antes').value) || null,
        dens_eps: parseFloat($('ajuste-dens-eps-antes').value) || null,
        expansao: parseFloat($('ajuste-expansao-antes').value) || null
      },
      resultados_depois: {
        densidade: parseFloat($('ajuste-densidade-depois').value) || null,
        flow: parseFloat($('ajuste-flow-depois').value) || null,
        dens_eps: parseFloat($('ajuste-dens-eps-depois').value) || null,
        expansao: parseFloat($('ajuste-expansao-depois').value) || null
      }
    };

    // Calcula melhorias
    calcularMelhorias(novoAjuste);

    // Adiciona à lista
    ajustes.push(novoAjuste);
    salvarAjustes();

    // Feedback e limpeza
    mostrarMensagemSucesso(`Ajuste registrado com sucesso!`);
    limparFormularioAjuste();
    renderHistorico();
  };

  // Calcula as melhorias/mudanças nos parâmetros
  function calcularMelhorias(ajuste) {
    ajuste.melhorias = {};

    const antes = ajuste.resultados_antes;
    const depois = ajuste.resultados_depois;

    // Densidade
    if (antes.densidade !== null && depois.densidade !== null) {
      ajuste.melhorias.densidade = ((depois.densidade - antes.densidade) / antes.densidade * 100).toFixed(1);
    }

    // Flow
    if (antes.flow !== null && depois.flow !== null) {
      ajuste.melhorias.flow = ((depois.flow - antes.flow) / antes.flow * 100).toFixed(1);
    }

    // Densidade EPS
    if (antes.dens_eps !== null && depois.dens_eps !== null) {
      ajuste.melhorias.dens_eps = ((depois.dens_eps - antes.dens_eps) / antes.dens_eps * 100).toFixed(1);
    }

    // Expansão
    if (antes.expansao !== null && depois.expansao !== null) {
      ajuste.melhorias.expansao = ((depois.expansao - antes.expansao) / antes.expansao * 100).toFixed(1);
    }
  }

  // Renderiza histórico
  function renderHistorico() {
    const tbody = $('ajustes-tbody');

    if (ajustes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-3);padding:30px">Nenhum ajuste registrado</td></tr>';
      return;
    }

    tbody.innerHTML = ajustes.map(ajuste => {
      const dataFormatada = new Date(ajuste.data_hora).toLocaleString('pt-BR');
      const materiaisStr = ajuste.materiais.map(m => `${m.quantidade}${m.unidade} ${m.nome}`).join(', ') || '—';
      const densidadeAnt = ajuste.resultados_antes.densidade || '—';
      const densidadeDepois = ajuste.resultados_depois.densidade || '—';
      const melhoriaDensidade = ajuste.melhorias.densidade ? `${ajuste.melhorias.densidade}%` : '—';

      return `
        <tr>
          <td>${dataFormatada}</td>
          <td><strong>${ajuste.bateria_id}</strong></td>
          <td>${ajuste.traco_idx + 1}</td>
          <td>${ajuste.motivo}</td>
          <td style="font-size:.85rem;color:var(--text-2)">${materiaisStr}</td>
          <td>${ajuste.tempo_adicional}s</td>
          <td>${densidadeAnt}</td>
          <td>${densidadeDepois}</td>
          <td style="color:${ajuste.melhorias.densidade > 0 ? 'var(--green)' : 'var(--red)'}">${melhoriaDensidade}</td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="verDetalhesAjuste(${ajuste.id})">Detalhes</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deletarAjuste(${ajuste.id})">Deletar</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Ver detalhes do ajuste
  window.verDetalhesAjuste = function (ajusteId) {
    const ajuste = ajustes.find(a => a.id === ajusteId);
    if (!ajuste) return;

    const conteudo = `
      <h2 style="margin-bottom:20px;color:var(--accent)">Detalhes do Ajuste</h2>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)">
          <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">ID Bateria</div>
          <div style="font-weight:600;color:var(--accent)">${ajuste.bateria_id}</div>
        </div>
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)">
          <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">Data/Hora</div>
          <div style="font-weight:600">${new Date(ajuste.data_hora).toLocaleString('pt-BR')}</div>
        </div>
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);grid-column:1/-1">
          <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">Motivo</div>
          <div style="font-weight:600">${ajuste.motivo}</div>
        </div>
      </div>

      ${ajuste.descricao_problema ? `
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:20px">
          <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;margin-bottom:8px">Descrição do Problema</div>
          <div style="font-family:var(--font-mono);font-size:.85rem;line-height:1.5">${ajuste.descricao_problema}</div>
        </div>
      ` : ''}

      <div style="padding:16px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:20px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:10px;color:var(--text)">Materiais Adicionados</div>
        ${ajuste.materiais.length > 0 ? `
          <ul style="list-style:none;padding:0;margin:0">
            ${ajuste.materiais.map(m => `
              <li style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
                <span>${m.nome}</span>
                <span style="color:var(--text-3)">${m.quantidade} ${m.unidade}</span>
              </li>
            `).join('')}
          </ul>
        ` : '<span style="color:var(--text-3)">Nenhum material adicionado</span>'}
      </div>

      <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:20px">
        <div style="font-size:.8rem;color:var(--text-3);text-transform:uppercase;margin-bottom:4px">Tempo de Batida Adicional</div>
        <div style="font-weight:600">${ajuste.tempo_adicional} segundos</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)">
          <div style="font-size:.75rem;color:var(--text-3);text-transform:uppercase;margin-bottom:10px">Antes</div>
          <div style="font-size:.85rem;line-height:1.8">
            <div><strong>Densidade:</strong> ${ajuste.resultados_antes.densidade || '—'} g/cm³</div>
            <div><strong>Flow:</strong> ${ajuste.resultados_antes.flow || '—'} cm</div>
            <div><strong>Dens. EPS:</strong> ${ajuste.resultados_antes.dens_eps || '—'} g/cm³</div>
            <div><strong>Expansão:</strong> ${ajuste.resultados_antes.expansao || '—'}%</div>
          </div>
        </div>
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)">
          <div style="font-size:.75rem;color:var(--text-3);text-transform:uppercase;margin-bottom:10px">Depois</div>
          <div style="font-size:.85rem;line-height:1.8">
            <div><strong>Densidade:</strong> ${ajuste.resultados_depois.densidade || '—'} g/cm³</div>
            <div><strong>Flow:</strong> ${ajuste.resultados_depois.flow || '—'} cm</div>
            <div><strong>Dens. EPS:</strong> ${ajuste.resultados_depois.dens_eps || '—'} g/cm³</div>
            <div><strong>Expansão:</strong> ${ajuste.resultados_depois.expansao || '—'}%</div>
          </div>
        </div>
      </div>

      ${Object.keys(ajuste.melhorias).length > 0 ? `
        <div style="padding:12px;background:var(--bg-input);border-radius:var(--radius-sm)">
          <div style="font-size:.75rem;color:var(--text-3);text-transform:uppercase;margin-bottom:10px">Melhoria (%)</div>
          <div style="font-size:.85rem;line-height:1.8">
            ${ajuste.melhorias.densidade ? `<div><strong>Densidade:</strong> <span style="color:${ajuste.melhorias.densidade > 0 ? 'var(--green)' : 'var(--red)'}">${ajuste.melhorias.densidade}%</span></div>` : ''}
            ${ajuste.melhorias.flow ? `<div><strong>Flow:</strong> <span style="color:${ajuste.melhorias.flow > 0 ? 'var(--green)' : 'var(--red)'}">${ajuste.melhorias.flow}%</span></div>` : ''}
            ${ajuste.melhorias.dens_eps ? `<div><strong>Dens. EPS:</strong> <span style="color:${ajuste.melhorias.dens_eps > 0 ? 'var(--green)' : 'var(--red)'}">${ajuste.melhorias.dens_eps}%</span></div>` : ''}
            ${ajuste.melhorias.expansao ? `<div><strong>Expansão:</strong> <span style="color:${ajuste.melhorias.expansao > 0 ? 'var(--green)' : 'var(--red)'}">${ajuste.melhorias.expansao}%</span></div>` : ''}
          </div>
        </div>
      ` : ''}
    `;

    mostrarModal(conteudo, 'modal-detalhes-ajuste');
  };

  // Deleta ajuste
  window.deletarAjuste = function (ajusteId) {
    if (confirm('Tem certeza que deseja deletar este ajuste?')) {
      ajustes = ajustes.filter(a => a.id !== ajusteId);
      salvarAjustes();
      renderHistorico();
      alert('Ajuste deletado com sucesso!');
    }
  };

  // Mostra modal genérico
  function mostrarModal(conteudo, modalId) {
    let modal = $(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      document.body.appendChild(modal);
    }

    modal.style.cssText = `
      display:flex;
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.7);
      z-index:999;
      align-items:center;
      justify-content:center
    `;

    modal.innerHTML = `
      <div style="
        background:var(--bg-card);
        border:1px solid var(--border);
        border-radius:var(--radius-lg);
        padding:32px;
        width:600px;
        max-width:90vw;
        max-height:80vh;
        overflow-y:auto;
        box-shadow:0 24px 80px rgba(0,0,0,.6)
      ">
        <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:start">
          <div style="flex:1">${conteudo}</div>
          <button onclick="this.closest('div').parentElement.style.display='none'" 
            style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-2);padding:0;margin-left:20px">
            ✕
          </button>
        </div>
      </div>
    `;
  }

  // Mostra mensagem de sucesso
  function mostrarMensagemSucesso(msg) {
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      position:fixed;
      top:20px;
      right:20px;
      background:var(--green);
      color:white;
      padding:16px 20px;
      border-radius:var(--radius-sm);
      z-index:9999;
      font-weight:600
    `;
    messageEl.textContent = msg;
    document.body.appendChild(messageEl);

    setTimeout(() => messageEl.remove(), 3000);
  }

  // Atualiza relógio
  function updateClock() {
    const clockEl = document.getElementById('topbar-clock');
    if (!clockEl) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}:${s}`;
  }

  // Inicializa quando chamado
  window.initAjustesReceita = init;

  // Inicializa automaticamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
