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

### Admin API key

Generate a random key:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `.env`:

```dotenv
ADMIN_API_KEY=your-generated-value
```

The key must contain at least 16 characters. A frontend admin application must send it through the `x-admin-api-key` header. It must never be placed in public browser code in a real deployment; the shared key is only an MVP authentication method.

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
| `ADMIN_API_KEY` | Yes | No real default | Protects all admin endpoints. Minimum 16 characters. |
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

### List inquiries for the admin table

```http
GET http://localhost:3000/api/v1/admin/inquiries?page=1&limit=25&sortBy=createdAt&sortOrder=desc
x-admin-api-key: your-admin-api-key
```

Example filters can be combined:

```text
?status=READY&category=SALES&priority=HIGH&replyRecommended=true&search=Mari
```

### Get inquiry details

Replace `{id}` with the ID returned by the public endpoint or admin list:

```http
GET http://localhost:3000/api/v1/admin/inquiries/{id}
x-admin-api-key: your-admin-api-key
```

### Read the active company prompt

```http
GET http://localhost:3000/api/v1/admin/settings/ai
x-admin-api-key: your-admin-api-key
```

### Update the company prompt

```http
PUT http://localhost:3000/api/v1/admin/settings/ai
Content-Type: application/json
x-admin-api-key: your-admin-api-key
```

```json
{
  "companyPrompt": "We build websites for small businesses. Keep replies concise and never promise a price or delivery date."
}
```

Each save creates a new immutable prompt version. Send an empty `companyPrompt` to reset the additional business context. Prompt changes apply only to future analyses.

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
