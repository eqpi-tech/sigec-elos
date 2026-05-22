# SIGEC-ELOS — Client Landing Page (Handoff para Claude Code)

## Contexto

Cada empresa que vira cliente do SIGEC-ELOS ganha uma landing page pública e personalizada no SIGEC-ELOS. Essa página funciona como portal de fornecedores daquele cliente específico — similar ao que a Sertras faz (ex: sertras.com/v3/engeform-engenharia/).

O fornecedor que se cadastra a partir dessa LP fica automaticamente vinculado ao cliente (como se tivesse recebido um convite).

## Stack existente

- React + Vite (deploy Netlify)
- Supabase (Auth, DB, Storage, RLS)
- Stripe (pagamentos)
- Netlify Functions (server-side com service_role)
- Domínio: elos.eqpitech.com.br

## Rota

A LP deve ser acessível em: `elos.eqpitech.com.br/portal/:slug`

Exemplo: `elos.eqpitech.com.br/portal/engeform`

O `:slug` identifica o cliente e é usado para buscar a config no Supabase.

## Modelo de dados (Supabase)

### Tabela: `client_landing_pages`

```sql
CREATE TABLE client_landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES user_roles(id) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  
  -- Personalizáveis pelo cliente
  logo_url TEXT,
  hero_image_url TEXT,
  accent_color VARCHAR(7) DEFAULT '#F47E2F',
  description TEXT,
  compliance_url TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  contact_email TEXT,
  badges TEXT[] DEFAULT '{}',
  
  -- Controle
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_client_lp_slug ON client_landing_pages(slug);
```

### RLS

A LP é pública (leitura por slug). Escrita restrita ao próprio cliente e ao admin.

```sql
ALTER TABLE client_landing_pages ENABLE ROW LEVEL SECURITY;

-- Leitura pública (a LP é uma página pública)
CREATE POLICY "Public read active LPs"
  ON client_landing_pages FOR SELECT
  USING (is_active = true);

-- Escrita pelo dono ou admin
CREATE POLICY "Owner or admin can update"
  ON client_landing_pages FOR UPDATE
  USING (
    client_id IN (SELECT id FROM user_roles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

## Fluxo de vínculo (o mais importante)

Quando o fornecedor clica "Solicitar Cadastro" na LP do cliente:

1. A LP redireciona para: `/register?cnpj=XXXXX&ref=SLUG`
2. A página de registro lê os query params `cnpj` e `ref`
3. Após criar a conta, o sistema:
   - Resolve o `slug` → `client_id` via `client_landing_pages`
   - Cria um registro na tabela `invitations` vinculando o fornecedor ao cliente
   - Isso faz o fornecedor aparecer na aba "Fornecedores" do buyer

## Estrutura do template (7 seções)

1. **Navbar fixa** — Logo do cliente + "powered by SIGEC-ELOS" + links âncora + CTA
2. **Hero** — Título com nome do cliente + subtítulo + badges + card de registro/login (abas)
3. **Sobre a empresa** — Texto descritivo + cards de valor (Transparência, Agilidade, Oportunidades)
4. **Como funciona** — 4 steps (CNPJ → Plano → Documentos → Selo)
5. **Planos** — ELOS Simples R$290/ano | ELOS Premium R$990/ano (preços fixos, não editáveis pelo cliente)
6. **Barra de confiança** — Logo EQPI Tech + métricas (60k+ fornecedores, 7,2bi docs, 31% redução)
7. **CTA final + Footer** — "Pronto para ser fornecedor?" + links + disclaimer

## O que é personalizável pelo cliente

| Campo | Onde aparece | Default |
|-------|-------------|---------|
| `logo_url` | Navbar, pode aparecer no hero | — |
| `hero_image_url` | Background do hero (opacity baixa) | Imagem genérica de indústria |
| `accent_color` | CTAs, badges, step numbers, destaques | `#F47E2F` (orange EQPI) |
| `company_name` | Hero, About, CTAs, Footer | — |
| `description` | Seção "Sobre a empresa" | — |
| `compliance_url` | Link na seção About | null (esconde se vazio) |
| `badges` | Pills no hero (ex: ISO 9001, ESG) | `[]` |
| `website_url` | Footer | null |
| `linkedin_url` | Footer | null |
| `contact_email` | Botão "Falar com a empresa" | null |

## O que NÃO é personalizável

- Preços dos planos (R$290 e R$990) — definidos globalmente
- Features dos planos
- Steps do processo
- Métricas da EQPI Tech
- Estrutura/layout da página
- Branding "powered by SIGEC-ELOS"

## Paleta base (CSS variables)

```css
:root {
  --navy: #0D1B2A;
  --blue: #1B2A4A;
  --orange: #F47E2F;    /* substituída por accent_color do cliente */
  --white: #FFFFFF;
  --grey: #667085;
  --light: #F7F8FA;
}
```

A `accent_color` do cliente substitui o `--orange` via CSS variable dinâmica:
```jsx
<div style={{ '--accent': clientConfig.accent_color || '#F47E2F' }}>
```

## Fontes

O template usa Outfit (body) + Playfair Display (headings), importadas do Google Fonts. Não são personalizáveis pelo cliente nesta versão.

## Arquivo de referência

O componente React completo está em anexo: `ClientLandingTemplate.jsx`

Ele usa dados mockados no objeto `DEMO_CLIENT` — na implementação real, substituir por fetch do Supabase via slug da URL.

## Implementação sugerida

1. Criar a tabela `client_landing_pages` no Supabase
2. Criar a rota `/portal/:slug` no React Router
3. Criar um componente `ClientPortal.jsx` que:
   - Lê o `:slug` da URL
   - Faz fetch na tabela `client_landing_pages` por slug
   - Renderiza o template com os dados do cliente
   - Se slug não existe ou `is_active=false` → redireciona para 404
4. Modificar a página de registro para ler `?ref=SLUG`:
   - Resolver slug → client_id
   - Criar vínculo na tabela invitations após registro
5. (Futuro) Criar tela no backoffice/visão buyer para editar os campos da LP

## Referências visuais

- Sertras Engeform: https://www.sertras.com/v3/engeform-engenharia/
- Sertras Quantum: https://www.sertras.com/v3/quantum-portal-fornecedores/
- LandingPage atual do ELOS: src/pages/LandingPage.jsx (usar mesma paleta e hooks como useIsMobile)
