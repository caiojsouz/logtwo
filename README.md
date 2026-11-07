# logtwo.

Diário de filmes minimalista para duas pessoas: um único histórico compartilhado, mas cada pessoa dá a própria nota e escreve o próprio comentário.

- **Frontend:** HTML5, Tailwind CSS (CDN), JavaScript vanilla — Vercel
- **Backend:** Node.js + Express (ESM) — Render
- **Banco:** Turso (libSQL/SQLite)
- **Auth:** JWT em cookie HTTP-Only + bcrypt
- **Metadados:** TMDB (busca, pôsteres, duração)
- **Extras:** indicações da dupla, até 4 filmes favoritos por pessoa e foto de perfil persistida no banco

---

## Estrutura

```
.
├── backend/
│   ├── server.js              # inicializa schema e sobe a API
│   ├── scripts/init-db.js     # aplica o schema manualmente
│   ├── .env.example
│   └── src/                   # app, rotas, middlewares, serviços e schema
└── frontend/
    ├── index.html             # login / cadastro
    ├── connect.html           # criar diário ou entrar com convite
    ├── dashboard.html         # abas Assistidos, Indicações e Perfil
    ├── vercel.json            # rewrite /api/* → Render
    └── assets/
```

> O `vercel.json` de deploy fica em **`frontend/`** porque esse diretório é o **Root Directory** configurado na Vercel. Não mova o arquivo para a raiz do repositório.

---

## Rodando localmente

```bash
cd backend
npm install
cp .env.example .env
```

Preencha o `.env`:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=qualquer-segredo-local
TURSO_DATABASE_URL=file:./data/logtwo.db
TMDB_ACCESS_TOKEN=seu-read-access-token-v4
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

```bash
npm run db:init
npm run dev
```

Abra `http://localhost:3000`. O Express serve a API e o frontend no mesmo host, então o cookie funciona sem CORS.

> Sem credencial do TMDB a busca retorna `503`, mas cadastro, convite, dashboard e avaliações continuam funcionando.
> Indicações e favoritos só conseguem incluir um filme que já esteja no cache local (`movies`) ou que possa ser buscado no TMDB.

---

## Novas rotas da API

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/api/recommendations` | lista as indicações do diário com quem indicou |
| `POST` | `/api/recommendations` | indica um filme (`{ "movieId": 550 }`) |
| `DELETE` | `/api/recommendations/:movieId` | remove uma indicação da dupla |
| `DELETE` | `/api/movies/:id/watch` | remove um filme dos assistidos (apaga as avaliações da dupla) |
| `GET` | `/api/profile` | perfil logado + favoritos |
| `PATCH` | `/api/profile` | atualiza o nome (`{ "name": "..." }`) |
| `POST` | `/api/profile/avatar` | envia a foto como `multipart/form-data` no campo `avatar` |
| `DELETE` | `/api/profile/avatar` | remove a foto |
| `GET` | `/api/profile/favorites` | lista os favoritos |
| `POST` | `/api/profile/favorites` | adiciona favorito (`{ "movieId": 550 }`), limite de 4 |
| `DELETE` | `/api/profile/favorites/:movieId` | remove um favorito |

---

## Fotos de perfil no Render

O backend do Render usa disco efêmero, então nenhuma imagem é gravada em arquivo. O upload segue o mesmo princípio do KlubbHQ (**multer com `memoryStorage`**, validação de tipo e tamanho, zero escrita em disco), mas a imagem é persistida diretamente no Turso:

1. O navegador recorta a foto em um quadrado de **512 × 512** e exporta em **WebP** (fallback JPEG).
2. O `FormData` chega ao Express em memória; o backend valida o MIME, os **magic bytes** e o limite de **2 MB**.
3. A imagem é convertida em data URL (`data:image/webp;base64,...`) e salva em `users.avatar_data`.
4. Sidebar, dupla e modal leem esse campo via `avatarUrl`, então a foto continua disponível depois de hibernar, reiniciar ou fazer novo deploy.

> O schema aplica `ALTER TABLE users ADD COLUMN avatar_data TEXT` automaticamente em bancos que já existiam.

---

## Checklist de deploy

### 0. Pré-requisitos

- [ ] Conta no [Turso](https://turso.tech), [Render](https://render.com) e [Vercel](https://vercel.com)
- [ ] Credencial do TMDB (Read Access Token v4 ou API Key v3)
- [ ] Repositório no GitHub com o projeto

### 1. Git — commit e push na `main`

```bash
# Apenas se o repositório ainda não existir:
git init -b main

git add .
git commit -m "chore: prepara deploy do logtwo"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/logtwo.git
git push -u origin main
```

O `.gitignore` já exclui `node_modules/`, `.env` e `backend/data/`.

### 2. Turso — banco de produção

```bash
turso auth login
turso db create logtwo-db
turso db show logtwo-db --url
turso db tokens create logtwo-db
```

Guarde:

- **URL:** `libsql://logtwo-db-<org>.turso.io`
- **Token:** saída do último comando

O schema é aplicado automaticamente no boot do backend (DDL idempotente). Não é necessário rodar migração manual.

### 3. Render — backend Node

Crie um **Web Service**:

| Configuração | Valor |
| --- | --- |
| Repository | seu repositório GitHub |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Variáveis de ambiente **obrigatórias**:

| Variável | Exemplo / observação |
| --- | --- |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | `openssl rand -hex 48` |
| `TURSO_DATABASE_URL` | `libsql://logtwo-db-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | token gerado no passo 2 |
| `FRONTEND_ORIGINS` | `https://seu-projeto.vercel.app` (sem barra no final) |

Variáveis **recomendadas**:

| Variável | Exemplo / observação |
| --- | --- |
| `TMDB_ACCESS_TOKEN` | Read Access Token v4 (preferido) |
| `TMDB_API_KEY` | alternativa v3, se não usar o token |
| `TMDB_LANGUAGE` | `pt-BR` |
| `COOKIE_SAMESITE` | `lax` ao usar o proxy `/api` da Vercel (opcional) |

> Em produção o backend **não sobe** se faltar `FRONTEND_ORIGINS`, se a URL do banco não começar com `libsql://` ou se faltar `TURSO_AUTH_TOKEN`. Isso evita perder dados em um SQLite efêmero.

Anote a URL pública do Render, por exemplo:
`https://logtwo-api.onrender.com`

### 4. Vercel — frontend estático

1. O rewrite já aponta para o backend em produção. Se o seu serviço no Render tiver outro subdomínio, ajuste o `destination` em `frontend/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://logtwo-api.onrender.com/api/$1"
    }
  ]
}
```

> O destino **precisa** terminar com `/api/$1`. Apontar apenas para `https://logtwo-api.onrender.com` faz a Vercel devolver a raiz do backend para todas as chamadas, e o frontend recebe uma resposta sem JSON.

2. Na Vercel: **Add New → Project → Import Git Repository**.
3. Configuração do projeto:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Other
   - **Build Command:** vazio
   - **Output Directory:** padrão
4. Clique em **Deploy** e copie o domínio gerado (`https://seu-projeto.vercel.app`).
5. Volte ao Render, atualize `FRONTEND_ORIGINS` com esse domínio e faça **Manual Deploy → Deploy latest commit**.

O rewrite mantém as chamadas em `/api` no mesmo domínio da Vercel, então o cookie de sessão continua first-party. Se preferir chamar o Render diretamente, defina `apiBase` em `frontend/assets/js/config.js` e mantenha o cookie em `SameSite=None; Secure` (padrão em produção).

### 5. Pós-deploy

- [ ] `GET https://logtwo-api.onrender.com/api/health` retorna `{"status":"ok"}`
- [ ] Login e cadastro funcionam no domínio da Vercel
- [ ] Criar diário gera código de convite
- [ ] Segunda conta entra com o código e o criador é redirecionado
- [ ] Busca do TMDB retorna filmes com pôster
- [ ] Cada pessoa salva e edita somente a própria nota
- [ ] Abas **Assistidos**, **Indicações** e **Perfil** trocam sem recarregar a página
- [ ] Indicar um filme pela ficha o faz aparecer na aba Indicações
- [ ] O limite de 4 favoritos é respeitado (o quinto botão fica desabilitado)
- [ ] Foto de perfil sobrevive a um novo deploy/hibernação do Render
- [ ] DevTools → Application → Cookies mostra `logtwo_session` como `HttpOnly` e `Secure`

---

## Variáveis de ambiente (referência)

| Variável | Obrigatória em produção | Descrição |
| --- | --- | --- |
| `NODE_ENV` | sim | deve ser `production` |
| `JWT_SECRET` | sim | segredo de assinatura da sessão |
| `TURSO_DATABASE_URL` | sim | URL `libsql://...` |
| `TURSO_AUTH_TOKEN` | sim | token do Turso |
| `FRONTEND_ORIGINS` | sim | origens permitidas, separadas por vírgula |
| `TMDB_ACCESS_TOKEN` | recomendada | token v4 do TMDB |
| `TMDB_API_KEY` | alternativa | chave v3 do TMDB |
| `TMDB_LANGUAGE` | não | padrão `pt-BR` |
| `COOKIE_SAMESITE` | não | `none` (padrão) ou `lax` com proxy |
| `PORT` | não | o Render injeta automaticamente |

---

## Solução de problemas

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| API não sobe no Render | env de produção incompleta | veja o log; faltam `FRONTEND_ORIGINS`, Turso ou `JWT_SECRET` |
| `401` após login | origem ou cookie bloqueado | confira `FRONTEND_ORIGINS`, HTTPS e o rewrite `/api` |
| Busca retorna `503` | TMDB sem credencial | configure `TMDB_ACCESS_TOKEN` ou `TMDB_API_KEY` |
| Primeira requisição lenta | Render Free hiberna | aguarde o cold start (~30–60 s) |
| Login com fundo claro | HTML/CSS em cache | recarregue com cache limpo; o body já tem `bg-zinc-950` explícito |
| `resposta inválida` / `data is null` | rewrite da Vercel sem `/api/$1` | corrija o `destination` e faça redeploy na Vercel |

---

## Segurança

- Senhas com bcrypt (cost 12) e e-mail único.
- Sessão JWT de 7 dias em cookie `HttpOnly`, `Secure` em produção.
- A avaliação é sempre gravada com o `user_id` do JWT — o body não aceita outro usuário.
- Indicações e assistidos podem ser removidos por qualquer pessoa da dupla; favoritos só pelo dono. O limite de 4 favoritos é validado na rota e por um trigger no SQLite.
- As horas assistidas somam apenas filmes que saíram das indicações: um título ainda na fila não entra no total mesmo que alguém já tenha dado nota.
- Upload de avatar em memória, com whitelist PNG/JPG/WEBP/GIF, verificação de magic bytes, limite de 2 MB e SVG bloqueado.
- Rate limit em autenticação, busca e perfil, validação de entrada e SQL parametrizado.
- Código de convite exposto apenas para quem criou o diário enquanto ele está pendente.
- Saída do DOM escapada no frontend.
