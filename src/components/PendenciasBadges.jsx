// ⚠️ de pendências do fornecedor na busca (12/11, pedido VIX — patch_176): o
// cliente (Meus fornecedores) e o backoffice (Busca de processos) veem, sem abrir
// o processo, se faltam documentos e/ou o questionário. Mesmo critério da
// entrada na fila do analista. O detalhe (quantos, de qual cliente) vai no title.
const pill = { fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 8px', fontFamily: 'Montserrat,sans-serif', cursor: 'help', whiteSpace: 'nowrap' }
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

export const temDocsPendentes = (p) => !!p && (p.docs + p.mob + p.pessoas) > 0
export const temQuestPendente = (p) => !!p && p.quest > 0

function linhasDocs(p) {
  return [
    p.docs ? plural(p.docs, 'documento do processo', 'documentos do processo') : null,
    p.mob ? plural(p.mob, 'documento de mobilização', 'documentos de mobilização') : null,
    p.pessoas ? plural(p.pessoas, 'pessoa a cadastrar nos postos', 'pessoas a cadastrar nos postos') : null,
  ].filter(Boolean).join(' · ')
}

export default function PendenciasBadges({ p, porCliente = false }) {
  if (!p) return null
  const varios = porCliente && (p.processos || []).length > 1
  const tDocs = varios
    ? p.processos.filter(temDocsPendentes).map(x => `${x.cliente}: ${linhasDocs(x)}`).join('\n')
    : linhasDocs(p)
  const tQuest = varios
    ? p.processos.filter(temQuestPendente).map(x => `${x.cliente}: ${plural(x.quest, 'pergunta obrigatória sem resposta', 'perguntas obrigatórias sem resposta')}`).join('\n')
    : plural(p.quest, 'pergunta obrigatória sem resposta', 'perguntas obrigatórias sem resposta')
  return <>
    {temDocsPendentes(p) && (
      <span title={`Pendente de envio pelo fornecedor:\n${tDocs}`} style={{ ...pill, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>⚠️ Documentos pendentes</span>
    )}
    {temQuestPendente(p) && (
      <span title={`Questionário:\n${tQuest}`} style={{ ...pill, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>⚠️ Questionário não respondido</span>
    )}
  </>
}
