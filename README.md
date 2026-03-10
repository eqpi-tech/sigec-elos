# SIGEC-ELOS · Protótipo de Validação v1.0

Plataforma de Pré-Homologação e Marketplace de Fornecedores — EQPI Tech  
🌐 **https://elos.eqpitech.com.br**

---

## Deploy — GitHub + Netlify + CNAME

### Passo 1 — Criar repositório no GitHub

```bash
# 1. Descompacte o ZIP e entre na pasta
unzip sigec-elos-v1.zip && cd sigec-elos

# 2. Inicialize o Git
git init
git add .
git commit -m "feat: prototipo SIGEC-ELOS v1.0"

# Via GitHub CLI (recomendado):
gh repo create eqpi-tech/sigec-elos --private --source=. --push

# OU: crie pelo site (github.com/new), depois:
git remote add origin https://github.com/SEU-ORG/sigec-elos.git
git branch -M main
git push -u origin main
```

---

### Passo 2 — Conectar no Netlify

1. Acesse **https://app.netlify.com** → **Add new site** → **Import an existing project**
2. Escolha **GitHub** e autorize o acesso
3. Selecione o repositório **sigec-elos**
4. As configurações já estao no `netlify.toml` — o Netlify detecta automaticamente:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Clique em **Deploy site**

O primeiro deploy leva ~2 minutos. O Netlify vai gerar uma URL temporaria tipo `https://amazing-name-123.netlify.app`.

---

### Passo 3 — Configurar CNAME elos.eqpitech.com.br

**No Netlify:**
1. Va em **Site configuration** → **Domain management** → **Add a domain**
2. Digite: `elos.eqpitech.com.br`
3. Clique em **Verify** → **Add domain**
4. O Netlify mostrara o valor do CNAME (ex: `amazing-name-123.netlify.app`)

**No seu provedor de DNS (Registro.br / Cloudflare / Route53):**

```
Tipo:   CNAME
Nome:   elos
Valor:  amazing-name-123.netlify.app   <- use o nome gerado pelo Netlify
TTL:    300 (ou automatico)
```

**Propagacao:** DNS leva entre 5 minutos e 2 horas.  
Verifique em: https://dnschecker.org/#CNAME/elos.eqpitech.com.br

**HTTPS:** Apos o DNS propagar, va em Netlify → Domain management → HTTPS → Provision certificate.  
O certificado Let's Encrypt e gratuito e automatico.

---

### Deploy Continuo (CI/CD)

Todo push para `main` dispara um novo deploy automaticamente:

```bash
git add .
git commit -m "fix: ajuste no marketplace"
git push origin main
# Netlify detecta, builda e publica em ~1 min
```

Cada Pull Request ganha uma URL de preview automatica — ideal para o time de negocios validar antes de publicar.

---

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:5173
```

---

## Estrutura do Projeto

```
sigec-elos/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx       # Navegacao + seletor de perfis DEMO
│   │   └── ui.jsx           # Biblioteca: Badge, Seal, Button, Card, KpiCard...
│   ├── pages/
│   │   ├── Dashboard.jsx    # T01 Dashboard do Fornecedor
│   │   ├── Planos.jsx       # T02 Planos e Precos
│   │   ├── Marketplace.jsx  # T03 Vitrine de Fornecedores
│   │   └── OtherPages.jsx   # T04 Perfil | T05 Admin | T06 Onboarding
│   ├── styles/globals.css   # Design tokens CSS
│   ├── App.jsx              # Shell + roteamento
│   └── main.jsx             # Entry point
├── index.html
├── vite.config.js
├── netlify.toml             # Config build + redirects SPA + headers
├── .gitignore
└── package.json
```

---

## Perfis de demonstracao

Use o seletor DEMO na navbar para alternar entre:

| Perfil     | Telas |
|------------|-------|
| Fornecedor | Dashboard, Documentos, Meu Plano |
| Comprador  | Marketplace, Cotacoes |
| Admin      | Visao Geral, Aprovacoes, Financeiro |

---

(c) 2025 EQPI Tech - Uso interno
