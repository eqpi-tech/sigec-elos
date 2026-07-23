import { useNavigate } from 'react-router-dom'

const SECTIONS = [
  {
    n: '1',
    title: 'Quem somos e escopo',
    body: `Esta política descreve como a EQPI Tech trata dados pessoais no âmbito da plataforma SIGEC-ELOS (pré-qualificação, homologação e marketplace de fornecedores), acessível em elos.eqpitech.com.br. Quando o tratamento ocorre por conta e ordem de empresa contratante (ex.: dados de colaboradores da contratante), a EQPI Tech atua como operadora; para dados de fornecedores que aderem espontaneamente à plataforma, atua como controladora.`,
  },
  {
    n: '2',
    title: 'Dados que tratamos',
    body: `(a) Dados cadastrais e de contato profissional de usuários: nome, e-mail corporativo, telefone comercial, cargo e empresa.\n\n(b) Dados de sócios e representantes legais de empresas fornecedoras constantes de documentos e certidões de fontes públicas oficiais (nome e CPF em quadros societários, CNDs e certidões de regularidade), tratados exclusivamente para a finalidade de qualificação.\n\n(c) Registros de acesso (data, hora e IP), conforme exigido pelo Marco Civil da Internet.\n\nNão coletamos dados pessoais sensíveis, biometria ou imagem.`,
  },
  {
    n: '3',
    title: 'Finalidades e bases legais',
    body: `Autenticação e gestão de acesso; condução dos processos de qualificação e homologação; comunicações transacionais; cobrança de assinaturas; segurança e auditoria.\n\nBases legais: execução de contrato e procedimentos preliminares (art. 7º, V), cumprimento de obrigação legal (art. 7º, II) e legítimo interesse (art. 7º, IX) limitado à verificação de idoneidade em fontes públicas e à segurança da plataforma.\n\nNão utilizamos dados pessoais para marketing sem consentimento nem realizamos decisões automatizadas com efeitos jurídicos sobre os titulares.`,
  },
  {
    n: '4',
    title: 'Compartilhamento e suboperadores',
    body: `Não vendemos dados pessoais. Compartilhamos apenas com suboperadores necessários à prestação do serviço, sob contratos de proteção de dados (DPA):\n\n• Supabase — banco de dados, autenticação e armazenamento (São Paulo/Brasil)\n• Netlify — hospedagem e funções\n• Amazon Web Services — conta dedicada (São Paulo/Brasil)\n• Stripe — pagamentos (dados de cartão não transitam pela EQPI)\n• Resend e Amazon SES — e-mails transacionais`,
  },
  {
    n: '5',
    title: 'Transferências internacionais',
    body: `O armazenamento dos dados (banco, arquivos e backups) ocorre integralmente no Brasil (região São Paulo). Há processamento pontual e transitório nos Estados Unidos por suboperadores (execução de funções da aplicação, pagamentos e envio de e-mails), amparado por cláusulas contratuais padrão nos termos do art. 33, II da LGPD.`,
  },
  {
    n: '6',
    title: 'Retenção e descarte',
    body: `• Dados de contas: vigência da relação + 6 meses\n• Dados de qualificação: vigência + 5 anos (prazos prescricionais); fornecedores reprovados: descarte em até 12 meses\n• Registros de acesso: 6 meses\n• Documentos fiscais: 5 anos\n\nAo término dos prazos, os dados são eliminados de forma segura ou anonimizados.`,
  },
  {
    n: '7',
    title: 'Segurança',
    body: `• Criptografia em trânsito (TLS 1.2+/1.3) e em repouso (AES-256)\n• Senhas com hash bcrypt e verificação contra bases de senhas vazadas\n• Autenticação multifator\n• Isolamento por Row Level Security em todas as tabelas\n• Privilégio mínimo\n• Trilha de auditoria\n• Backups diários em duas localizações independentes\n• Monitoramento contínuo de vulnerabilidades`,
  },
  {
    n: '8',
    title: 'Direitos dos titulares',
    body: `Nos termos do art. 18 da LGPD, o titular pode solicitar: confirmação de tratamento, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamentos e revisão de decisões.\n\nCanal: privacidade@eqpitech.com.br\n\nFluxo: recebimento → verificação de identidade → execução → resposta nos prazos legais. Toda solicitação é registrada em trilha de auditoria.`,
  },
  {
    n: '9',
    title: 'Encarregado (DPO)',
    body: `Luiz Panareli\nprivacidade@eqpitech.com.br`,
  },
  {
    n: '10',
    title: 'Alterações',
    body: `Esta política pode ser atualizada; a versão vigente e a data de atualização estarão sempre publicadas na plataforma.`,
  },
]

export default function Privacidade() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight:'100vh', background:'#f8f9ff', fontFamily:'DM Sans,sans-serif' }}>

      {/* ── Cabeçalho ── */}
      <div style={{ background:'linear-gradient(135deg,#1a1c5e 0%,#2E3192 100%)', padding:'48px 5% 40px' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <button onClick={() => navigate(-1)}
            style={{ background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)',
              borderRadius:8, padding:'6px 14px', color:'rgba(255,255,255,.7)', cursor:'pointer',
              fontSize:12, fontFamily:'DM Sans,sans-serif', marginBottom:24 }}>
            ← Voltar
          </button>
          <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:13,
            color:'#F47E2F', letterSpacing:2, textTransform:'uppercase', marginBottom:10 }}>
            SIGEC-ELOS · EQPI Tech
          </div>
          <h1 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:900, fontSize:32,
            color:'#fff', margin:'0 0 10px', lineHeight:1.2 }}>
            Política de Privacidade
          </h1>
          <p style={{ color:'rgba(255,255,255,.55)', fontSize:13, margin:0 }}>
            Versão 1.0 · Julho/2026 · Equipo Info Serviços de TI Ltda · CNPJ 21.270.860/0001-15
          </p>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ maxWidth:800, margin:'0 auto', padding:'48px 5% 80px' }}>

        {/* Encarregado DPO — destaque */}
        <div style={{ background:'#fff', border:'1px solid #e2e4ef', borderLeft:'4px solid #2E3192',
          borderRadius:12, padding:'16px 20px', marginBottom:40,
          display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ fontSize:24 }}>🔒</div>
          <div>
            <div style={{ fontFamily:'Montserrat,sans-serif', fontWeight:700, fontSize:13, color:'#1a1c5e', marginBottom:2 }}>
              Encarregado de Dados (DPO)
            </div>
            <div style={{ fontSize:13, color:'#64748b' }}>
              Luiz Panareli ·{' '}
              <a href="mailto:privacidade@eqpitech.com.br"
                style={{ color:'#2E3192', textDecoration:'none', fontWeight:600 }}>
                privacidade@eqpitech.com.br
              </a>
            </div>
          </div>
        </div>

        {/* Seções */}
        {SECTIONS.map(s => (
          <div key={s.n} style={{ marginBottom:36 }}>
            <h2 style={{ fontFamily:'Montserrat,sans-serif', fontWeight:800, fontSize:16,
              color:'#1a1c5e', margin:'0 0 10px',
              display:'flex', alignItems:'baseline', gap:10 }}>
              <span style={{ background:'#2E3192', color:'#fff', borderRadius:6,
                padding:'2px 9px', fontSize:11, fontWeight:700, fontFamily:'Montserrat,sans-serif',
                flexShrink:0 }}>
                {s.n}
              </span>
              {s.title}
            </h2>
            <div style={{ background:'#fff', borderRadius:12, padding:'18px 22px',
              border:'1px solid #e9ebf5', lineHeight:1.8, color:'#374151', fontSize:14 }}>
              {s.body.split('\n\n').map((para, i) => (
                <p key={i} style={{ margin: i === 0 ? 0 : '12px 0 0', whiteSpace:'pre-line' }}>
                  {para}
                </p>
              ))}
            </div>
          </div>
        ))}

        {/* Rodapé */}
        <div style={{ borderTop:'1px solid #e2e4ef', paddingTop:28, marginTop:12,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div style={{ fontSize:12, color:'#9B9B9B' }}>
            © 2026 Equipo Info Serviços de TI Ltda · CNPJ 21.270.860/0001-15
          </div>
          <a href="mailto:privacidade@eqpitech.com.br"
            style={{ fontSize:12, color:'#2E3192', textDecoration:'none', fontWeight:600 }}>
            privacidade@eqpitech.com.br
          </a>
        </div>
      </div>
    </div>
  )
}
