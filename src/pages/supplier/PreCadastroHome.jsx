import { Button, Card } from '../../components/ui.jsx'

// Painel do fornecedor que só tem PRÉ-CADASTRO (patch_126): sem processo, sem
// envio de documentos. Incentiva o questionário do cliente, mostra o perfil
// Comprador Free e o caminho para iniciar a homologação pelo portal.
export default function PreCadastroHome({ supplier, preRegs, navigate }) {
  const h = { fontFamily:'Montserrat,sans-serif', fontWeight:800, color:'#1a1c5e' }
  const p = { fontFamily:'DM Sans,sans-serif', fontSize:13.5, color:'#475569', lineHeight:1.6 }
  return (
    <div style={{ maxWidth:880, margin:'0 auto' }}>
      <div style={{ ...h, fontSize:22, marginBottom:4 }}>Pré-cadastro</div>
      <div style={{ ...p, marginBottom:20 }}>{supplier?.razao_social}</div>

      {preRegs.map(r => {
        const pend = Math.max(0, (r.q_total || 0) - (r.q_answered || 0))
        return (
          <Card key={r.id} style={{ borderRadius:16, padding:'20px 22px', marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
              <span style={{ fontSize:30 }}>📝</span>
              <div style={{ flex:1, minWidth:240 }}>
                <div style={{ ...h, fontSize:16 }}>Pré-cadastro na {r.client_name}</div>
                <div style={{ ...p, fontSize:12.5, color:'#9B9B9B' }}>Desde {new Date(r.created_at).toLocaleDateString('pt-BR')} · sem custo</div>
                <div style={{ ...p, marginTop:8 }}>
                  A {r.client_name} já pode ver o cadastro da sua empresa. {r.in_process
                    ? <strong>Seu processo de homologação com a {r.client_name} já foi aberto.</strong>
                    : 'Se ela convidar sua empresa para a homologação, você recebe um e-mail com o próximo passo.'}
                </div>
                {r.q_total > 0 && (
                  <div style={{ marginTop:12, padding:'12px 14px', borderRadius:12,
                    background: pend ? '#fffbeb' : '#f0fdf4', border:`1px solid ${pend ? '#fde68a' : '#86efac'}` }}>
                    <div style={{ ...h, fontSize:13, color: pend ? '#92400e' : '#15803d' }}>
                      {pend ? `❓ Questionário da ${r.client_name}: ${r.q_answered} de ${r.q_total} respondidas` : `✅ Questionário da ${r.client_name} respondido`}
                    </div>
                    {pend > 0 && <div style={{ ...p, fontSize:12.5, color:'#92400e', marginTop:2 }}>Responder o questionário ajuda a {r.client_name} a conhecer sua empresa e é o primeiro passo para ser convidado.</div>}
                    {pend > 0 && <Button variant="orange" size="sm" style={{ marginTop:10 }} onClick={() => navigate('/fornecedor/questionario')}>Responder questionário →</Button>}
                  </div>
                )}
              </div>
              {!r.in_process && r.slug && (
                <Button variant="neutral" size="sm" onClick={() => navigate(`/portal/${r.slug}`)}>🏅 Iniciar homologação</Button>
              )}
            </div>
          </Card>
        )
      })}

      <Card style={{ borderRadius:16, padding:'20px 22px' }}>
        <div style={{ ...h, fontSize:15, marginBottom:10 }}>O que você pode fazer agora</div>
        <div style={{ ...p }}>
          <div>🛒 <strong>Perfil Comprador</strong> — busque fornecedores no marketplace: troque o perfil na barra do menu.</div>
          <div>🏢 <strong>Meus dados</strong> — mantenha os dados da empresa atualizados. <a onClick={() => navigate('/fornecedor/dados')} style={{ color:'#2E3192', fontWeight:700, cursor:'pointer' }}>Abrir →</a></div>
          <div style={{ marginTop:8, fontSize:12.5, color:'#9B9B9B' }}>O envio de documentos é liberado quando a homologação começa — por convite do cliente ou pelo pagamento no portal dele.</div>
        </div>
      </Card>
    </div>
  )
}
