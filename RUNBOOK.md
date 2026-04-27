## Overview
This runbook explains how to run, test, and deploy the **Messaging Automation Platform** (NestJS + Prisma + Postgres + Redis + React/Vite dashboard).

---

## Requirements
- **Node.js**: 20+
- **PostgreSQL**: 15+
- **Redis**: 7+
- **Docker** (recommended): 24+

---

## First-time setup (from zero)

### 1) Clone
```bash
git clone <your-repo-url>
cd messaging_automation_platform
```

### 2) Create env file
Copy `.env.example` to `.env` and fill values:
```bash
cp .env.example .env
```

Minimum required for backend boot:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_SEC`

Recommended:
- `REDIS_URL` (required for queues)
- `META_APP_SECRET` (required for WhatsApp webhook signature guard)
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`

### 3) Start Postgres + Redis (Docker)
```bash
docker compose up -d postgres redis
```

### 4) Install backend deps
```bash
npm install
```

### 5) Apply migrations
Development:
```bash
npx prisma migrate dev
```
Production / CI:
```bash
npx prisma migrate deploy
```

### 6) Seed database
```bash
npm run db:seed
```

### 7) Run backend
```bash
npm run dev
```
Backend runs on `http://localhost:3000`.

### 8) Install + run dashboard
```bash
cd dashboard
npm install
npm run dev
```
Dashboard runs on `http://localhost:5173`.

---

## Docker compose (full stack)
If you want to run everything with Docker:
```bash
docker compose up --build
```

Notes:
- `backend` reads env vars from `.env` via `env_file`.
- `dashboard` runs Vite dev server inside the container on port 5173.

---

## Deployment

### Build commands
Backend:
```bash
npm run build
```

Dashboard:
```bash
cd dashboard
npm run build
```

### PM2 (example)
Install PM2:
```bash
npm i -g pm2
```

Start backend:
```bash
pm2 start dist/main.js --name messaging-backend
pm2 save
```

Environment variables:
- Use a process manager env file or platform secret manager.
- Never commit `.env` to git.

---

## Troubleshooting

### Redis connection errors / degraded mode
Symptoms:
- Log: `⚠️ Redis unavailable - running in degraded mode`
- Outbound queues are disabled.

Fix:
- Ensure `REDIS_URL` is set and Redis is reachable.
- Start Redis: `docker compose up -d redis`

### Migration failures (Prisma)
Symptoms:
- P3006 (shadow database failures) during `migrate dev`.

Fix:
- Prefer `npx prisma migrate deploy` for applying existing migrations (non-interactive).
- If drift is detected, **do not reset** in environments with data.
- Review migrations ordering and idempotency for shadow DB.

### Webhook verification errors
Symptoms:
- HTTP 403 from `POST /whatsapp/webhook`

Fix:
- Set `META_APP_SECRET` correctly.
- Ensure reverse proxy preserves raw body and headers.
- Confirm `X-Hub-Signature-256` is computed over raw bytes.

### Webhook body too large
Symptoms:
- HTTP 413 or parsing issues

Fix:
- Backend sets JSON/urlencoded body limit to 10mb in `src/main.ts`.

### Socket connection issues
Symptoms:
- Dashboard shows realtime = disconnected
- Websocket fails in dev behind Vite

Fix (dev):
- Ensure `dashboard/vite.config.js` proxies `/socket.io` to backend with `ws: true`.
- Ensure you are logged in (token required).

Fix (prod):
- Ensure your reverse proxy supports WebSockets and forwards `/socket.io`.

---

## Testing scripts
Scripts are located in `scripts/testing/`.
See each script header for required environment variables.

