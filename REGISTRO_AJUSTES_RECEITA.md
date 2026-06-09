# 📋 Módulo: Registro de Ajustes na Receita

## Visão Geral

O módulo **Registro de Ajustes na Receita** é uma funcionalidade integrada ao Sistema de Injeção Lightwall SC destinada ao registro sistemático de todos os insumos e correções aplicadas após a receita inicial, quando houver necessidade de ajuste do traço.

Este módulo transforma a experiência prática dos operadores em conhecimento estruturado, criando uma base histórica de ações corretivas que será fundamental para futuras ferramentas de recomendação inteligente de ajustes.

---

## 🎯 Objetivos Principais

1. **Rastrear Ajustes**: Registrar todos os ajustes realizados em cada receita de produção
2. **Documentar Ações Corretivas**: Manter registro detalhado dos materiais adicionados e modificações aplicadas
3. **Medir Eficácia**: Comparar resultados antes e depois para avaliar o impacto de cada ajuste
4. **Acumular Conhecimento**: Criar histórico que permita identificar padrões e melhores práticas
5. **Suportar Inteligência**: Preparar dados para futuras análises preditivas e recomendações automáticas

---

## 🔧 Funcionalidades

### 1. Registro de Novo Ajuste

O operador pode registrar um novo ajuste preenchendo os seguintes dados:

#### **Informações Básicas**
- **ID da Bateria**: Identificação da bateria que recebeu o ajuste
- **Traço Original**: Referência ao traço inicial que está sendo ajustado
- **Data/Hora do Ajuste**: Timestamp automático ou manual
- **Motivo do Ajuste**: Seleção entre categorias predefinidas:
  - Densidade inadequada
  - Flow incorreto
  - Expansão anômala
  - Temperatura fora do controle
  - Pressão inadequada
  - Qualidade visual inferior
  - Reação química lenta
  - Reação química rápida
  - Outros motivos

#### **Descrição Detalhada**
- Campo de texto livre para descrever o problema detectado em detalhes
- Permite contexto adicional não coberto pelas categorias

#### **Materiais Adicionados**
- Interface dinâmica para adicionar múltiplos materiais
- Cada material registra:
  - Nome do material (Ex: Poliéster, Catalisador, Água)
  - Quantidade adicionada
  - Unidade (g, kg, ml, l, %)
- Possibilidade de adicionar/remover materiais conforme necessário

#### **Tempo de Batida Adicional**
- Duração extra de batida em segundos
- Essencial para ajustes que exigem mais processamento

#### **Resultados Antes e Depois**
Dois conjuntos de parâmetros medidos:

**Antes do Ajuste:**
- Densidade (g/cm³)
- Flow (cm)
- Densidade EPS (g/cm³)
- Expansão (%)

**Depois do Ajuste:**
- Mesmos parâmetros acima

### 2. Cálculo Automático de Melhoria

O sistema calcula automaticamente o percentual de melhoria/mudança para cada parâmetro:

```
Melhoria(%) = ((Depois - Antes) / Antes) × 100
```

- **Positivo (verde)**: Melhoria alcançada
- **Negativo (vermelho)**: Piora detectada
- **Nulo**: Sem mudança significativa

### 3. Histórico de Ajustes

Tabela que exibe todos os ajustes registrados com informações resumidas:

| Campo | Descrição |
|-------|-----------|
| Data/Hora | Quando o ajuste foi realizado |
| ID Bateria | Identificação da bateria |
| Traço | Número/índice do traço original |
| Motivo | Categoria do ajuste |
| Materiais | Resumo dos materiais adicionados |
| Tempo Adic. | Tempo de batida adicional |
| Densidade Ant. | Densidade antes do ajuste |
| Densidade Dep. | Densidade depois do ajuste |
| Melhoria | Percentual de melhoria na densidade |
| Ações | Botões para visualizar detalhes ou deletar |

### 4. Visualização Detalhada

Modal que exibe informações completas de um ajuste:

- Informações gerais (bateria, data, motivo)
- Descrição completa do problema
- Lista detalhada de todos os materiais adicionados
- Tempo de batida adicional
- Comparação lado-a-lado dos resultados
- Percentual de melhoria para cada parâmetro

---

## 💾 Armazenamento de Dados

### Estrutura de Dados

Cada ajuste registrado segue esta estrutura JSON:

```json
{
  "id": 1718558400000,
  "bateria_id": "BAT-001",
  "traco_idx": 0,
  "data_hora": "2024-06-16T14:30:00",
  "motivo": "Densidade inadequada",
  "descricao_problema": "Espuma com densidade abaixo do especificado...",
  "tempo_adicional": 15,
  "materiais": [
    {
      "id": 0,
      "nome": "Poliéster",
      "quantidade": 50,
      "unidade": "g"
    },
    {
      "id": 1,
      "nome": "Catalisador",
      "quantidade": 10,
      "unidade": "ml"
    }
  ],
  "resultados_antes": {
    "densidade": 0.32,
    "flow": 24.5,
    "dens_eps": 0.16,
    "expansao": 2.1
  },
  "resultados_depois": {
    "densidade": 0.35,
    "flow": 25.8,
    "dens_eps": 0.18,
    "expansao": 2.4
  },
  "melhorias": {
    "densidade": "9.4",
    "flow": "5.3",
    "dens_eps": "12.5",
    "expansao": "14.3"
  }
}
```

### Persistência

- **Local**: localStorage do navegador (key: `ajustes_receita`)
- **Backup**: Recomenda-se exportar regularmente para arquivo externo
- **Sincronização**: Futuras versões poderão sincronizar com servidor backend

---

## 📊 Casos de Uso

### Caso 1: Ajuste de Densidade
**Cenário**: Espuma produzida com densidade abaixo da especificação

**Ação**:
1. Operador seleciona "Densidade inadequada" como motivo
2. Registra a densidade inicial (0.32 g/cm³)
3. Adiciona 50g de poliéster
4. Aumenta tempo de batida em 10s
5. Mede nova densidade (0.35 g/cm³)

**Resultado**: Sistema registra 9.4% de melhoria

### Caso 2: Ajuste de Flow
**Cenário**: Flow inadequado durante injeção

**Ação**:
1. Seleciona "Flow incorreto"
2. Registra flow inicial (24.5 cm)
3. Adiciona 10ml de catalisador
4. Mede novo flow (25.8 cm)

**Resultado**: Melhoria de 5.3% documentada

### Caso 3: Ajuste Complexo
**Cenário**: Múltiplos parâmetros fora da especificação

**Ação**:
1. Documenta o problema em detalhes
2. Adiciona múltiplos materiais (poliéster, catalisador, água)
3. Aumenta tempo de batida
4. Mede todos os parâmetros antes e depois

**Resultado**: Registro completo para análise de impacto

---

## 🤖 Futuras Aplicações de IA

Este módulo foi projetado com escalabilidade em mente para suportar:

### 1. **Motor de Recomendação Inteligente**
- Análise de padrões em ajustes bem-sucedidos
- Sugestão automática de ajustes baseada em problemas detectados
- "Para este tipo de problema, estes materiais funcionaram bem 85% das vezes"

### 2. **Previsão de Parâmetros**
- Estimativa de impacto antes de fazer o ajuste
- "Adicionar 50g de poliéster provavelmente aumentará densidade em ~8%"

### 3. **Otimização Contínua**
- Identificação de melhores práticas por operador
- Variações de eficácia entre turnos e operadores
- Recomendação de ajustes personalizados

### 4. **Análise Preditiva**
- Detecção de quando um ajuste será necessário
- Prevenção de produção fora de especificação
- Redução de retrabalho

### 5. **Integração com IoT**
- Coleta automática de dados de sensores
- Menos dependência de entrada manual
- Maior precisão nos registros

---

## 📋 Especificações Técnicas

### Arquivos

- **HTML**: Seção integrada em `index.html` (id: `page-ajustes-receita`)
- **JavaScript**: `ajustes-receita.js`
- **Dados**: Armazenamento em localStorage + arquivo JSON opcional

### Dependências

- Framework: Vanilla JS (sem dependências externas)
- Estilo: CSS variables do projeto Lightwall
- Armazenamento: localStorage do navegador

### Navegação

Acessível via:
- Sidebar: "Ajustes de Receita" (ícone de sincronização)
- Programaticamente: `showPage('ajustes-receita', element)`

---

## 🔐 Considerações de Segurança e Validação

### Validação de Entrada
- Campos obrigatórios: ID Bateria, Traço, Data/Hora, Motivo
- Validação de tipos numéricos para parâmetros
- Limite de caracteres em descrições

### Proteção de Dados
- Dados armazenados localmente (sem exposição a rede por padrão)
- Possibilidade de backup/exportação para arquivo
- Histórico mantido para auditoria

### Controle de Qualidade
- Cálculos automáticos de melhoria para reduzir erros
- Visualização clara de antes/depois
- Possibilidade de revogar/deletar registros

---

## 📈 Métricas e Relatórios Potenciais

### Estatísticas Possíveis
- Taxa de sucesso de ajustes por tipo de motivo
- Materiais mais frequentemente utilizados
- Tempo médio gasto em ajustes
- Eficácia por operador/turno
- Distribuição de problemas detectados

### Exportação
- Relatórios em CSV/Excel
- Visualizações de tendências
- Comparativas entre períodos

---

## 🚀 Roadmap

### Fase 1 (Atual)
- ✅ Formulário de registro de ajustes
- ✅ Armazenamento em localStorage
- ✅ Visualização de histórico
- ✅ Cálculo de melhoria

### Fase 2 (Próxima)
- Backend para sincronização
- Exportação de dados
- Análises estatísticas básicas
- Dashboard de ajustes

### Fase 3 (Futuro)
- Integração com sensores IoT
- Motor de recomendação com IA
- Previsão de parâmetros
- Otimização automática de receitas

---

## 📞 Suporte e Feedback

Para dúvidas, sugestões ou relatar problemas, consulte a equipe de desenvolvimento.

**Última atualização**: Junho 2024
**Versão**: 1.0.0
