// lib/score.js — Score EQPI (0–100) + parecer. Handoff §8 (motor
// determinístico; pesos em bc_config 'score_weights', ajustáveis sem deploy).
//
// Entrada: sources = { connector: { status, result_flag, parsed } } (a linha
// mais recente/terminal de cada conector do request) + weights do bc_config.
// Saída: { score, band, findings[], parecer }
//
// Regras fixas de negócio (não parametrizadas): lista crítica zera p/ faixa
// crítico; certidão-chave indisponível trava a faixa máxima em 'medio'.

const DEFAULT_WEIGHTS = {
  lista_critica: 60, cnd_federal_positiva: 25, cnd_federal_pen: 8,
  crf_irregular: 15, cndt_positiva: 15, situacao_nao_ativa: 40,
  protesto_baixo: 5, protesto_alto: 20, assertiva_ef: 20, assertiva_d: 10,
  acoes_1a3: 5, acoes_muitas: 15, ccf: 10, pendencias_min: 5, pendencias_max: 15,
  empresa_2anos: 5, empresa_1ano: 10, pep: 10, midia_negativa: 15,
  faixas: { baixo: 80, medio: 60, alto: 40 },
}

const CRITICAL_LISTS = ['ceis', 'cnep', 'trabalho_escravo', 'ofac', 'onu']
const KEY_CERTS = ['pgfn_cnd', 'fgts_crf', 'cndt']

function get(sources, slug) { return sources?.[slug] || null }
function flag(sources, slug) { return get(sources, slug)?.result_flag || null }
function details(sources, slug) { return get(sources, slug)?.parsed?.details || {} }

function computeScore(sources, weights = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights, faixas: { ...DEFAULT_WEIGHTS.faixas, ...(weights.faixas || {}) } }
  const findings = [] // { sev: 3 crítico | 2 grave | 1 atenção | 0 info, texto, penalidade }
  let score = 100
  let critical = false
  let capMedio = false

  const pen = (points, sev, texto) => {
    score -= points
    findings.push({ sev, texto, penalidade: points })
  }

  // 1. listas críticas — apontamento = risco crítico automático
  for (const slug of CRITICAL_LISTS) {
    if (flag(sources, slug) === 'apontamento') {
      critical = true
      const nomes = { ceis: 'CEIS', cnep: 'CNEP', trabalho_escravo: 'Lista Suja do Trabalho Escravo', ofac: 'OFAC (SDN)', onu: 'sanções ONU' }
      pen(w.lista_critica, 3, `Apontamento em lista crítica: ${nomes[slug]}`)
    }
  }
  // leniência com acordo do CNPJ é grave (não zera sozinha)
  if (flag(sources, 'leniencia') === 'apontamento') {
    pen(w.assertiva_d, 2, 'Acordo de Leniência (CGU) envolvendo o CNPJ')
  }

  // 2. situação cadastral
  const base = details(sources, 'cnpj_base')
  if (get(sources, 'cnpj_base') && flag(sources, 'cnpj_base') === 'apontamento') {
    pen(w.situacao_nao_ativa, 3, `Situação cadastral na Receita: ${base.situacao || 'não ativa'}`)
  }
  if (base.idade_anos != null) {
    if (base.idade_anos < 1) pen(w.empresa_1ano, 1, 'Empresa com menos de 1 ano de atividade')
    else if (base.idade_anos < 2) pen(w.empresa_2anos, 1, 'Empresa com menos de 2 anos de atividade')
  }

  // 3. certidões-chave
  const cnd = get(sources, 'pgfn_cnd')
  if (cnd) {
    const msg = JSON.stringify(cnd.parsed?.details || {}).toLowerCase()
    if (cnd.result_flag === 'apontamento') pen(w.cnd_federal_positiva, 2, 'CND Federal (PGFN/RFB) POSITIVA — débitos exigíveis')
    else if (cnd.result_flag === 'verificar' && /efeitos? de negativa/.test(msg)) pen(w.cnd_federal_pen, 1, 'CND Federal positiva com efeitos de negativa')
    else if (cnd.result_flag === 'verificar') pen(w.cnd_federal_pen, 1, 'CND Federal exige verificação manual')
  }
  if (flag(sources, 'fgts_crf') === 'apontamento') pen(w.crf_irregular, 2, 'CRF FGTS irregular (Caixa)')
  if (flag(sources, 'cndt') === 'apontamento') pen(w.cndt_positiva, 2, 'CNDT POSITIVA — débitos trabalhistas (TST)')

  // certidão-chave indisponível: não pontua, mas trava a faixa em 'medio'
  for (const slug of KEY_CERTS) {
    const s = get(sources, slug)
    if (!s || s.status === 'failed_soft' || s.status === 'failed' || s.result_flag === 'indisponivel') {
      capMedio = true
      findings.push({ sev: 1, texto: `${slug === 'pgfn_cnd' ? 'CND Federal' : slug === 'fgts_crf' ? 'CRF FGTS' : 'CNDT'} indisponível na data da consulta`, penalidade: 0 })
    }
  }

  // 4. Assertiva (protestos, score, ações, CCF, pendências)
  const av = details(sources, 'assertiva_pj')
  if (get(sources, 'assertiva_pj') && av.score) {
    const prot = av.protestos || {}
    if ((prot.qtd || 0) > 0) {
      const alto = (prot.qtd || 0) > 1 || Number(prot.valor_total || 0) >= 5000
      pen(alto ? w.protesto_alto : w.protesto_baixo, alto ? 2 : 1,
        `${prot.qtd} protesto(s) público(s)${prot.valor_total != null ? ` (R$ ${Number(prot.valor_total).toLocaleString('pt-BR')})` : ''}`)
    }
    if (av.score.classe === 'E' || av.score.classe === 'F') pen(w.assertiva_ef, 2, `Score de crédito Assertiva classe ${av.score.classe}`)
    else if (av.score.classe === 'D') pen(w.assertiva_d, 1, 'Score de crédito Assertiva classe D')
    const ac = av.acoes_judiciais || {}
    if ((ac.qtd || 0) > 0) {
      const muitas = ac.qtd > 3 || Number(ac.valor || 0) > 500000
      pen(muitas ? w.acoes_muitas : w.acoes_1a3, muitas ? 2 : 1, `${ac.qtd} ação(ões) judicial(is)${ac.valor != null ? ` (R$ ${Number(ac.valor).toLocaleString('pt-BR')})` : ''}`)
    }
    if ((av.cheques_sem_fundo?.qtd || 0) > 0) pen(w.ccf, 2, `${av.cheques_sem_fundo.qtd} cheque(s) sem fundo (CCF)`)
    const deb = av.debitos || {}
    if ((deb.qtd || 0) > 0) {
      const val = Number(deb.valor || 0)
      const p = Math.min(w.pendencias_max, Math.max(w.pendencias_min, Math.round(val / 10000)))
      pen(p, val > 50000 ? 2 : 1, `${deb.qtd} pendência(s) financeira(s)${deb.valor != null ? ` (R$ ${val.toLocaleString('pt-BR')})` : ''}`)
    }
  }

  // 5. PEP e mídia (conectores do Full; ausentes no Light)
  if (flag(sources, 'pep') === 'apontamento' || flag(sources, 'pep') === 'verificar') {
    pen(w.pep, 1, 'Pessoa politicamente exposta (PEP) no quadro societário')
  }
  if (flag(sources, 'midia_negativa') === 'apontamento') {
    pen(w.midia_negativa, 1, 'Mídia negativa encontrada — revisão manual sugerida')
  }

  // matches fuzzy 'verificar' em OFAC/ONU/CEAF não pontuam, mas entram no parecer
  for (const slug of ['ofac', 'onu', 'ceaf']) {
    if (flag(sources, slug) === 'verificar') {
      findings.push({ sev: 1, texto: get(sources, slug)?.parsed?.headline || `${slug}: verificar correspondência de nome`, penalidade: 0 })
    }
  }

  score = Math.max(0, Math.min(100, score))
  let band
  if (critical || score < w.faixas.alto) band = 'critico'
  else if (score >= w.faixas.baixo) band = 'baixo'
  else if (score >= w.faixas.medio) band = 'medio'
  else band = 'alto'
  if (capMedio && band === 'baixo') band = 'medio'

  findings.sort((a, b) => b.sev - a.sev || b.penalidade - a.penalidade)
  return { score, band, findings, parecer: buildParecer(score, band, findings, sources) }
}

const BAND_LABEL = { baixo: 'BAIXO RISCO', medio: 'RISCO MÉDIO', alto: 'RISCO ALTO', critico: 'RISCO CRÍTICO' }

function buildParecer(score, band, findings, sources) {
  const razao = details(sources, 'cnpj_base').razao_social || 'A empresa consultada'
  const negativos = findings.filter((f) => f.penalidade > 0 || f.sev >= 1)
  const linhas = []
  linhas.push(`${razao} — Score EQPI ${score}/100 · ${BAND_LABEL[band]}.`)
  if (!negativos.length) {
    linhas.push('Não foram encontrados apontamentos nas fontes públicas consultadas: situação cadastral regular, certidões negativas e sem ocorrência em listas restritivas.')
  } else {
    linhas.push('Principais achados, em ordem de severidade:')
    for (const f of negativos.slice(0, 8)) linhas.push(`• ${f.texto}`)
  }
  const indis = findings.filter((f) => /indisponível/.test(f.texto))
  if (indis.length) linhas.push('Fontes indisponíveis na data serão reconsultadas automaticamente.')
  if (band === 'critico') linhas.push('Recomendação: NÃO seguir com a contratação sem análise aprofundada da EQPI.')
  else if (band === 'alto') linhas.push('Recomendação: seguir somente com garantias adicionais e reavaliação em 30 dias.')
  else if (band === 'medio') linhas.push('Recomendação: contratação possível com acompanhamento dos pontos listados.')
  else linhas.push('Recomendação: sem impedimentos identificados nas fontes consultadas.')
  return linhas.join('\n')
}

module.exports = { computeScore, DEFAULT_WEIGHTS, CRITICAL_LISTS, KEY_CERTS }
