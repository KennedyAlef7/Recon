# Conciliação Fiscal × Bancária

Aplicação web para conciliar **notas fiscais recebidas** contra **extratos bancários**, com extração automática por IA (PDFs), parsing local de OFX/Excel/CSV, sugestões de conciliação e relatórios exportáveis.

## Funcionalidades

- Upload de **notas fiscais (PDF)** — extração de fornecedor, CNPJ, número, data e valor via IA.
- Upload de **extratos** em OFX, Excel (.xls/.xlsx, incluindo layouts Itaú "Lançamentos" e SISPAG "Consulta de Pagamentos"), CSV e PDF.
- **Conciliação manual com sugestões automáticas** (por valor, nome, CNPJ e data), com suporte a pagamento parcial.
- Marcação de pagamentos **"Sem NF"** com justificativa.
- **Relatórios A e B** exportáveis em CSV.
- **Exportar / importar estado** completo (.json) para backup e continuidade.
- Validação anti-duplicidade (por arquivo e por registro).
- Dados salvos localmente no navegador entre sessões.
- **Login** com usuário/senha e proxy seguro da API (a chave nunca vai ao frontend).

## Stack

- React 18 + Vite + Tailwind CSS
- Serverless Functions (Vercel) para login e proxy da API Anthropic
- SheetJS (xlsx) e PapaParse para leitura local de planilhas/CSV

---

## Variáveis de ambiente

Configure em `.env` (local) e no painel da Vercel:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sim | Chave da API Anthropic. Usada **apenas** na função `/api/claude`. |
| `ANTHROPIC_MODEL` | Não | Modelo usado (padrão `claude-sonnet-4-20250514`). |
| `APP_USER` | Sim | Usuário do login. |
| `APP_PASSWORD` | Sim | Senha do login. |
| `AUTH_SECRET` | Sim | Segredo aleatório para assinar o cookie de sessão. |

Gere o `AUTH_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Rodando localmente

Como o app depende das funções em `/api`, use a CLI da Vercel para o ambiente local
(o `npm run dev` puro sobe só o frontend, sem as rotas `/api`).

```bash
npm install
npm i -g vercel          # se ainda não tiver
cp .env.example .env     # preencha os valores
vercel dev               # sobe frontend + funções em http://localhost:3000
```

> Alternativa só-frontend (sem IA/login): `npm run dev`. As chamadas a `/api/*` falharão.

---

## Publicando na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em https://vercel.com, clique em **Add New > Project** e importe o repositório.
3. Framework Preset: **Vite** (detectado automaticamente). Build e output já vêm do `vercel.json`.
4. Em **Settings > Environment Variables**, adicione as 5 variáveis acima.
5. **Deploy**. A cada `git push` na branch principal, a Vercel republica sozinha.

### Subindo para o GitHub (primeira vez)

```bash
git init
git add .
git commit -m "Conciliação fiscal: versão inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/conciliacao-fiscal.git
git push -u origin main
```

---

## Segurança

- A `ANTHROPIC_API_KEY` fica **somente no servidor** (função serverless). O frontend chama `/api/claude`, que exige sessão válida antes de repassar à Anthropic.
- O login usa cookie **HttpOnly + Secure + SameSite=Strict**, assinado com HMAC e expiração de 12h. O navegador não consegue ler o cookie via JavaScript.
- Comparação de credenciais em tempo constante (evita timing attacks).
- Este é um login de **camada simples** (um único usuário). Para múltiplos usuários, papéis ou recuperação de senha, migre para um provedor de identidade (ex.: Firebase Auth, Auth0).
- Os dados das notas/extratos ficam no `localStorage`/storage do navegador do usuário, não em banco de dados.

## Estrutura

```
conciliacao/
├── api/                  # Serverless Functions (Vercel)
│   ├── _auth.js          # assinatura/verificação do cookie de sessão
│   ├── login.js          # POST /api/login
│   ├── logout.js         # POST /api/logout
│   ├── session.js        # GET  /api/session
│   └── claude.js         # POST /api/claude (proxy autenticado da Anthropic)
├── src/
│   ├── components/
│   │   └── Login.jsx
│   ├── ConciliacaoFiscal.jsx   # app principal
│   ├── main.jsx                # auth gate + bootstrap
│   └── index.css
├── .env.example
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vercel.json
└── vite.config.js
```
