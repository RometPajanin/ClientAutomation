# Customer Inquiry Automation Backend

This backend accepts web-form inquiries, stores them in PostgreSQL, analyzes them with Gemini, prepares optional reply drafts for human review, and exposes the results through an authenticated admin API.

No response is sent automatically. Every inquiry remains subject to human review.

## Prerequisites

- Node.js 24 or newer
- npm
- Docker Desktop with Docker Compose
- A Gemini API key for AI analysis

The application runs locally with Node.js. Docker Compose runs only PostgreSQL, so source-code changes remain easy to test during development.

## 1. Install dependencies

From PowerShell in the project directory:

```powershell
cd D:\clientAutomation
npm install
```

## 2. Create the environment file

Copy the committed template to the untracked local `.env` file:

```powershell
Copy-Item .env.example .env
```

Do not commit `.env`. It contains local credentials and is already excluded by `.gitignore`.

### Demo administrator

The intentionally public demonstration credentials are:

```text
Username: admin
Password: demo-admin-password
```

The server configuration contains an scrypt password hash, not the plaintext password. A successful login creates an opaque database-backed session and a signed `HttpOnly`, `SameSite=Strict` cookie. The production cookie also uses `Secure` and the `__Host-` prefix. Settings updates and logout require the CSRF token returned by the login/session endpoint.

Set `SESSION_SECRET` to a new random 32+ character secret for any deployed environment. Production startup rejects a missing secret. These public demo credentials intentionally provide no real access control; replace them with individual identity-provider accounts and MFA for a real application.

### Gemini API key

1. Open [Google AI Studio](https://ai.google.dev/aistudio).
2. Create or select an API key.
3. Copy it into `.env`:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
```

Consult Google's current [Gemini API-key guide](https://ai.google.dev/gemini-api/docs/api-key) and [pricing page](https://ai.google.dev/gemini-api/docs/pricing) before use. Free-tier model availability and limits can change.

The server can start with an empty `GEMINI_API_KEY`, but inquiries will only be stored and will remain `RECEIVED`; AI analysis is disabled until a key is configured.

### Environment variables

| Variable | Required | Default/example | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | No | `development` | Selects development, test, or production behavior. |
| `HOST` | No | `0.0.0.0` | Address used by Fastify. |
| `PORT` | No | `3000` | HTTP port. |
| `LOG_LEVEL` | No | `info` | Fastify/Pino log level. |
| `DATABASE_URL` | Yes | Compose URL in `.env.example` | PostgreSQL connection used by Prisma. |
| `ADMIN_USERNAME` | No | `admin` | Demo administrator username. |
| `ADMIN_PASSWORD_HASH` | No | Demo scrypt hash | Password verifier; never configure a plaintext password. |
| `SESSION_SECRET` | Production | Random 32+ characters | Signs cookies and derives CSRF tokens. |
| `SESSION_TTL_SECONDS` | No | `28800` | Absolute administrator session lifetime. |
| `AUTH_RATE_LIMIT_MAX` | No | `5` | Login attempts allowed per auth rate-limit window. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | No | `900000` | Login rate-limit window. |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173` | Exact comma-separated credentialed browser origins. |
| `TRUST_PROXY` | No | `false` | Exact trusted proxy IP/CIDR or hop configuration. |
| `REQUIRE_HTTPS` | No | Production defaults to `true` | Reject requests Fastify does not identify as HTTPS. |
| `GEMINI_API_KEY` | For AI | Empty | Enables Gemini inquiry analysis. |
| `GEMINI_MODEL` | No | `gemini-3.1-flash-lite` | Gemini model identifier. |
| `GEMINI_TIMEOUT_MS` | No | `20000` | Maximum duration of one provider attempt. |
| `GEMINI_MAX_RETRIES` | No | `2` | Retry count after the initial Gemini request. |
| `INQUIRY_RATE_LIMIT_MAX` | No | `10` | Public requests allowed per rate-limit window. |
| `INQUIRY_RATE_LIMIT_WINDOW_MS` | No | `60000` | Public rate-limit window in milliseconds. |
| `DUPLICATE_WINDOW_HOURS` | No | `24` | Recent period used by duplicate detection. |

## 3. Start PostgreSQL

```powershell
docker compose up -d db
docker compose ps
```

PostgreSQL listens only on `127.0.0.1:5433`. Its data is retained in the Compose-managed `postgres_data` volume.

To stop the database without deleting its data:

```powershell
docker compose down
```

## 4. Generate Prisma Client and apply migrations

Generate the typed database client:

```powershell
npm run prisma:generate
```

Apply all committed migrations to a fresh or existing demo database:

```powershell
npm run db:deploy
```

Check migration status:

```powershell
npx prisma migrate status
```

When intentionally changing `prisma/schema.prisma` during development, create a new migration with a descriptive name:

```powershell
npm run db:migrate -- --name describe_the_change
```

Do not use `prisma migrate reset` unless all local database data can be deleted. Reset drops and rebuilds the development schema.

## 5. Start the development server

```powershell
npm run dev
```

Useful URLs:

- API: `http://localhost:3000`
- Liveness: `http://localhost:3000/health/live`
- Database readiness: `http://localhost:3000/health/ready`
- Swagger UI: `http://localhost:3000/documentation`
- OpenAPI JSON: `http://localhost:3000/documentation/json`

## 6. API usage

### Submit a web-form inquiry

```http
POST http://localhost:3000/api/v1/inquiries
Content-Type: application/json
```

```json
{
  "name": "Mari Maasikas",
  "email": "mari@example.com",
  "phone": "+37255555555",
  "service": "Website development",
  "message": "We need a new company website before the end of next month.",
  "consentToStore": true,
  "sourceReference": "webform-demo-001"
}
```

The endpoint returns `202 Accepted`. A new non-duplicate inquiry starts as `RECEIVED` and is analyzed asynchronously.

### Create an administrator session

```http
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "demo-admin-password"
}
```

The response sets the signed `HttpOnly` session cookie and returns a `csrfToken`. Browsers send the cookie automatically because the frontend uses credentialed requests. Non-browser clients must retain the `Set-Cookie` value and send it as `Cookie` on later requests.

### List inquiries for the admin table

```http
GET http://localhost:3000/api/v1/admin/inquiries?page=1&limit=25&sortBy=createdAt&sortOrder=desc
Cookie: ca_session=the-signed-session-cookie
```

Example filters can be combined:

```text
?status=READY&category=SALES&priority=HIGH&replyRecommended=true&search=Mari
```

### Get inquiry details

Replace `{id}` with the ID returned by the public endpoint or admin list:

```http
GET http://localhost:3000/api/v1/admin/inquiries/{id}
Cookie: ca_session=the-signed-session-cookie
```

### Read the active company prompt

```http
GET http://localhost:3000/api/v1/admin/settings/ai
Cookie: ca_session=the-signed-session-cookie
```

### Update the company prompt

```http
PUT http://localhost:3000/api/v1/admin/settings/ai
Content-Type: application/json
Cookie: ca_session=the-signed-session-cookie
x-csrf-token: token-returned-by-login-or-session
```

```json
{
  "companyPrompt": "We build websites for small businesses. Keep replies concise and never promise a price or delivery date."
}
```

Each save creates a new immutable prompt version. Send an empty `companyPrompt` to reset the additional business context. Prompt changes apply only to future analyses.

### Restore or end a session

`GET /api/v1/auth/session` restores the current user and returns a fresh copy of the deterministic per-session CSRF token after a page reload. `POST /api/v1/auth/logout` requires that token in `x-csrf-token`, revokes the database session, and clears the cookie.

## 7. Verification and production build

Run the complete local quality checks:

```powershell
npm run typecheck
npm test
npm run build
```

Start the compiled application:

```powershell
npm start
```

`npm start` runs `dist/server.js`, so run `npm run build` first. Apply committed migrations with `npm run db:deploy` before starting a newly deployed version.

## Database inspection

Prisma Studio provides a simple local database interface:

```powershell
npm run db:studio
```
