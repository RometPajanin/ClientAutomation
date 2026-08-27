# Security, Reliability, and Scalability Audit

**Audit date:** 2026-08-27  
**Scope:** `D:\clientAutomation` backend and the relevant browser client in `D:\ClientAutomationClient`  
**Method:** Static code/configuration review, local response-header and CORS checks, test review, dependency audit, and comparison with current official guidance. This was not a penetration test, cloud-configuration review, or legal/compliance assessment.

## Executive conclusion

The application now has a strong demonstration authentication flow in addition to its existing validation, transactional writes, health checks, and service boundaries. The former browser-held API key has been removed. Login now verifies an scrypt password hash, creates a revocable database session, and sends a signed opaque `HttpOnly`, `SameSite=Strict` cookie. Production cookies are `Secure` and use the `__Host-` prefix. State-changing authenticated requests require a per-session CSRF token, and logout revokes the server-side session.

It is **not ready to store real customer personal data in a production environment** until the following production blockers are addressed:

1. Deploy the implemented HTTPS enforcement/HSTS behavior behind a real TLS edge and require verified TLS to any remote production database.
2. Encrypt stored customer data with authenticated field-level encryption and externally managed keys. Email and phone are currently plaintext; so are other fields that can contain personal data.
3. Replace the intentionally public demo credential with individual identity-provider accounts and MFA if access control ever becomes real rather than demonstrative.
4. Replace the in-memory rate-limit state and in-process AI task runner before horizontally scaling or relying on guaranteed processing.

### Findings summary

| ID | Area | Current status | Risk / priority |
| --- | --- | --- | --- |
| SEC-01 | HTTPS and API transport | Production enforcement implemented; TLS termination remains deployment work | **Partially resolved** |
| SEC-02 | HSTS and response headers | Implemented and tested; HSTS is HTTPS-only | **Resolved in application** |
| SEC-03 | CORS | Exact environment allowlist with credential support and tests | **Resolved in application** |
| SEC-04 | CSRF | Per-session token required on authenticated mutations | **Resolved for current routes** |
| SEC-05 | Admin authentication | Revocable cookie sessions implemented; credential intentionally public | **Resolved for demo / not real access control** |
| PRIV-01 | Encryption at rest | Customer data stored in plaintext | **High — production blocker** |
| PRIV-02 | Data lifecycle and third-party transfer | No retention/deletion process; PII is sent to Gemini | **High** |
| RATE-01 | Rate limiting | Good single-instance public-route baseline; not distributed | **Medium now / High at scale** |
| REL-01 | AI job reliability | Same-process, non-durable, unbounded concurrency | **High** |
| DB-01 | Database correctness | Several strong transaction patterns; some race/invariant gaps | **Medium** |
| DB-02 | Query efficiency | Bounded results, but substring search and offset paging will degrade | **Medium** |
| ARCH-01 | Dependency injection | Good service/provider seams; infrastructure remains hard-wired | **Low / Medium** |
| DEP-01 | Dependency security | No known advisories after a tested patched override | **Pass, point-in-time only** |

## 1. CORS

**Verdict: implemented correctly for credentialed cookie requests, subject to correct deployment values.**

`src/app.ts` registers `@fastify/cors` globally with:

- an exact allowlist parsed from `CORS_ALLOWED_ORIGINS` (defaulting to `http://localhost:5173` for development);
- `GET`, `POST`, `PUT`, and `OPTIONS` methods;
- `Content-Type` and `x-csrf-token` request headers;
- `Access-Control-Allow-Credentials: true` for browser session cookies.

A runtime test confirms that the configured origin receives credentialed CORS authorization, an attacker origin does not, and the expected preflight returns `204`. `Vary: Origin` is present. This is materially safer than reflecting arbitrary origins or using a wildcard.

Limitations and required changes:

- Set a production `CORS_ALLOWED_ORIGINS` value; do not deploy the localhost default.
- Prefer serving the frontend and API from the same site when practical; that removes most CORS complexity.
- `SameSite=Strict` requires the frontend and API to be same-site. A genuinely cross-site deployment would need a deliberate cookie-policy redesign, not just another CORS entry.
- Do not use permissive origin reflection, broad regular expressions, or `*` for the admin API.
- CORS is a browser policy, not authentication or protection against scripts, bots, curl, or server-to-server traffic.

## 2. CSRF

**Verdict: implemented for every current authenticated state-changing route.**

The session cookie is an ambient browser credential, so the implementation now derives a deterministic CSRF token from the random session token using HMAC-SHA-256. Login and `GET /api/v1/auth/session` return the token to same-origin/allowed-origin JavaScript; it remains only in module memory. `PUT /api/v1/admin/settings/ai` and `POST /api/v1/auth/logout` require it in `x-csrf-token`, and comparison is timing-safe.

Defense in depth also includes `SameSite=Strict`, strict JSON bodies, a credentialed exact-origin CORS allowlist, and a custom header that triggers preflight. Automated tests prove that a valid session without the CSRF token receives `403` and that a valid logout revokes the database session.

Every future authenticated `POST`, `PUT`, `PATCH`, or `DELETE` route must explicitly include both the session and CSRF pre-handlers. Consider a method-aware scoped hook if the number of mutations grows, which reduces the chance of a developer forgetting the CSRF guard. Origin validation can be added as another independent check.

OWASP notes that custom request headers rely on CORS preflight and that only explicitly controlled origins should be allowed: [CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## 3. HTTPS, HSTS, and secure transport

**Verdict: application enforcement is implemented; real TLS remains a deployment responsibility.**

Development intentionally remains HTTP. In production, `REQUIRE_HTTPS` defaults to `true`; the security plugin rejects requests that Fastify does not identify as HTTPS. `TRUST_PROXY` is configurable and defaults to `false`, allowing a deployment to trust only its known TLS proxy IP/CIDR or hop. HTTPS responses receive staged HSTS (`max-age=31536000`). Production session cookies use `Secure` and `__Host-ca_session` with no `Domain` and `Path=/`.

The local PostgreSQL container is bound safely to `127.0.0.1`, but the connection string does not request or verify database TLS. This is acceptable only for the same-machine development arrangement; a remote production database must require TLS with certificate/hostname verification.

Remaining production deployment work:

1. Terminate public TLS at a managed load balancer or hardened reverse proxy using TLS 1.3, with TLS 1.2 retained only if compatibility requires it.
2. Do not expose the Fastify HTTP port publicly. Bind it to a private interface/network and allow only the trusted proxy to reach it.
3. Set `TRUST_PROXY` narrowly. An omitted/misconfigured value causes production requests behind a TLS proxy to be rejected, which is fail-closed.
4. Confirm HSTS at the deployed URL. Add `includeSubDomains` and `preload` only after confirming every subdomain can remain HTTPS-only.
5. Require TLS with CA and hostname verification for production PostgreSQL connections; also encrypt database snapshots and backups.
6. Set a private random `SESSION_SECRET` (required in production) and store it and the Gemini key in a managed secrets service with rotation procedures.

HSTS does not create HTTPS and must only be sent over a secure connection. OWASP recommends TLS for all API traffic and modern TLS versions: [Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html). Fastify also documents reverse-proxy TLS and narrowly scoped `trustProxy`: [Fastify deployment recommendations](https://fastify.dev/docs/latest/Guides/Recommendations/) and [Fastify server options](https://github.com/fastify/fastify/blob/main/docs/Reference/Server.md).

## 4. Security response headers

**Verdict: implemented and covered by integration tests.**

`@fastify/helmet` is registered globally, with a centralized security hook for the API-specific policy. Swagger retains its own compatible static CSP instead of receiving the JSON-only policy.

| Header | Current API status | Recommended treatment |
| --- | --- | --- |
| `X-Content-Type-Options: nosniff` | Present globally | Supplied by Helmet and tested on health responses. |
| `X-Frame-Options: DENY` | Present globally | Defense in depth; CSP `frame-ancestors` is the modern control. |
| `Referrer-Policy: no-referrer` | Present globally | Explicit strict privacy policy. |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | Present globally | Set by the centralized hook. |
| `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` | Present on non-documentation API responses | Swagger uses its own UI-compatible static CSP. |
| `Strict-Transport-Security: max-age=31536000` | Present only when Fastify identifies HTTPS | Must still be verified at the deployed edge. |
| `Cache-Control: no-store` | Present on `/api/v1/admin` and `/api/v1/auth` | Prevents normal browser/proxy storage of authenticated PII/session responses. |

Coverage currently asserts the core headers, authenticated `no-store` behavior, and CORS behavior. Extend it to explicit error, not-found, Swagger, and HTTPS-proxy cases if header configuration becomes more route-specific. The official plugin documents route-level overrides: [`@fastify/helmet`](https://github.com/fastify/fastify-helmet). General header behavior and limitations are summarized by the [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html).

## 5. Admin authentication and browser exposure

**Verdict: strong session mechanics for the requested public-credential demo; intentionally not real access control.**

Positive controls:

- the public password is represented server-side by an scrypt hash using `N=2^14`, `r=8`, `p=5`; plaintext is not stored in the backend configuration;
- credential checking performs the expensive scrypt derivation even for a wrong username and uses timing-safe comparisons;
- login is rate-limited to five attempts per 15 minutes per resolved client IP by default;
- successful login generates a 256-bit random opaque token; only its SHA-256 digest is stored in `AdminSession`;
- the signed cookie contains no username, role, or PII and has an eight-hour absolute lifetime;
- cookies are `HttpOnly`, `SameSite=Strict`, `Path=/`, signed with SHA-256, and become `Secure`/`__Host-` cookies in production;
- all admin routes validate an active, unrevoked, unexpired server-side session;
- logout revokes the database row and clears the cookie;
- the frontend never reads the cookie and stores only the CSRF token/current username in memory; page reload restores the session through `/api/v1/auth/session`;
- OpenAPI now documents cookie session and CSRF header security schemes;
- automated tests cover invalid credentials, cookie attributes, restoration, missing CSRF, revocation, and protected admin access.

Risks:

- `admin / demo-admin-password` is intentionally published, so anyone can legitimately authenticate. The flow demonstrates security mechanics, not authorization of a trusted person;
- there is only one configured identity and no MFA, roles, account recovery, lockout, or per-person audit attribution;
- an XSS cannot steal the `HttpOnly` cookie but can issue authenticated same-origin actions and read the in-memory CSRF token;
- sessions use absolute expiry rather than idle expiry; database cleanup currently runs during successful login rather than through a scheduled maintenance job;
- the development signing secret may be ephemeral/defaulted; production correctly requires an explicit 32+ character value.

If the application stops being a public demo, retain the server-side session/cookie/CSRF design but source identities from OIDC/OAuth, add MFA and roles, rotate the session on privilege changes, and record a stable per-user identity in audit events. OWASP recommends opaque high-entropy session IDs with meaning stored server-side and `Secure`, `HttpOnly`, explicit `SameSite` cookie attributes: [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The scrypt settings match an OWASP recommended cost profile: [Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## 6. Customer-data encryption and privacy

**Verdict: encryption at rest is missing.**

The Prisma schema stores `name`, `email`, `phone`, `message`, `responseDraft`, and AI-derived fields as normal plaintext database columns/JSON. `extractedData` can duplicate email and phone. The admin API reads and returns those values in plaintext. The SHA-256 inquiry fingerprint is deterministic hashing, not encryption; because it is unkeyed, it also permits offline guessing/linkability if a database dump is stolen.

Encrypting only email and phone would leave substantial personal data exposed. At minimum, classify and protect:

- name, email, and phone;
- free-form inquiry message and service field;
- AI extracted data, summaries, and response drafts where they can repeat customer data;
- backups, exports, logs, and temporary processing artifacts.

### Recommended design

1. Add a dedicated injectable `CustomerDataCrypto` service at the repository boundary.
2. Use authenticated encryption, preferably AES-256-GCM with a fresh cryptographically random 96-bit nonce per encrypted field/value. Store a versioned envelope containing algorithm/version, key identifier, nonce, ciphertext, and authentication tag. Bind record ID, tenant ID if introduced, and field name as authenticated additional data so ciphertext cannot be moved between records or fields undetected.
3. Use envelope encryption: a data-encryption key encrypts fields, and a key-encryption key in a managed KMS/HSM protects the data key. Keys must be separated from the database and support rotation. Do not commit or store the master key beside the ciphertext.
4. Use a separate HMAC key for deterministic lookup tokens. A normalized email/phone can have an `HMAC-SHA-256` blind index for exact matching. Replace the current unkeyed duplicate fingerprint with an HMAC-based fingerprint.
5. Randomized authenticated encryption intentionally prevents `ILIKE '%term%'` searches. Remove substring search over encrypted contact fields, use exact blind-index lookup, or adopt a separately secured search system after a specific threat review. Do not weaken encryption to retain arbitrary substring search.
6. Migrate safely: add encrypted/version columns, dual-write, backfill in bounded batches, verify decryptability and counts, switch reads, stop plaintext writes, then remove plaintext columns in a later migration. Ensure backups containing old plaintext age out according to policy.
7. Test tamper detection, wrong-key behavior, key rotation, partial migration recovery, and the guarantee that logs/errors never contain decrypted values.

Encryption must be accompanied by data minimization and lifecycle controls. Define a retention period, automated deletion/anonymization, customer deletion/export procedures, backup retention, and least-privilege access. Disk/database encryption is still required but does not replace field-level encryption; field encryption protects against a database-only compromise, while disk encryption primarily protects lost media.

The application also sends name, email, phone, service, and message content to Gemini for analysis. Confirm that customer notice/consent, provider data-processing terms, retention settings, geographic requirements, and incident procedures are appropriate. `store: false` is a useful application request flag but is not a substitute for reviewing the provider contract and deployed account configuration.

OWASP recommends minimizing stored sensitive data, using authenticated modes such as GCM, separating keys from data, and using managed key storage: [Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) and [Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html).

## 7. Rate limiting and resource controls

**Verdict: good single-instance MVP protection, incomplete for production abuse and scaling.**

Implemented strengths:

- the public inquiry POST has a configurable IP-based limit and returns `429` with `Retry-After`;
- administrator login has a separate, stricter configurable rate limit;
- the request body is capped at 20,000 bytes;
- Zod bounds individual string sizes;
- admin page size is capped at 100;
- Gemini calls have timeout and retry limits;
- known duplicate/replayed inquiries do not trigger another AI request;
- `@fastify/rate-limit` is version `11.2.0`, which contains the 2026 IPv6 normalization fix described in the project's [security advisory](https://github.com/fastify/fastify-rate-limit/security/advisories/GHSA-grpc-p53c-r64v).

Gaps:

- the default rate-limit store is in process. Limits reset on restart and are independent per server instance;
- production must set the new `TRUST_PROXY` option to its exact proxy topology for correct client-IP attribution;
- expensive authenticated admin searches, documentation, and settings updates have no separate limits;
- IP-only controls can be bypassed by distributed clients and may unfairly group users behind NAT;
- each accepted unique inquiry can create a paid Gemini task, and the runner has no global concurrency, queue-depth, or spend cap.

For production, place a coarse limit at the CDN/WAF, use a shared Redis/custom store for application limits, configure trusted proxy hops, add stricter failed-auth limits, and add layered quotas by IP plus authenticated identity. Add CAPTCHA/honeypot or another bot control to the public form when abuse warrants it. Enforce a global AI concurrency limit, queue capacity, per-period provider budget, and alerts.

The plugin documents that its default store is in-memory and that multi-server deployments require an external store: [`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit). OWASP treats missing limits on requests, payloads, and paid downstream operations as unrestricted resource consumption: [API4:2023](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## 8. Database reliability and query efficiency

### Existing strengths

- One Prisma client/pool is created for the application and disconnected during graceful shutdown.
- Inquiry plus audit-event creation uses one nested Prisma write.
- Analysis claiming uses an atomic status-guarded `updateMany`, preventing two workers from completing the same claim.
- Analysis completion/failure and their audit events use transactions.
- Prompt updates use serializable transactions with bounded retry.
- `sourceReference` is unique and the service handles concurrent idempotency-key insert races.
- Administrator sessions are revocable and expiry-indexed; only token digests are stored, so a database-only leak does not directly expose reusable cookie values.
- Queries use Prisma rather than interpolated SQL, input is strictly validated, list result size is bounded, and relevant single-column indexes exist.
- Database readiness is checked separately from process liveness.

### Reliability gaps

- The AI queue is in memory. A crash after accepting an inquiry can leave it `RECEIVED`; a crash after claim can leave it `PROCESSING`. There is no lease expiry, retry scheduler, dead-letter queue, or startup reconciliation.
- Duplicate detection has a race for simultaneous equivalent submissions with different source references: both requests can observe no recent original and both become originals.
- “Only one active prompt” is enforced by application transactions, not by a database invariant. Add a PostgreSQL partial unique index for the active row if the model must guarantee this property.
- No backup, restore-test, point-in-time recovery, retention, or disaster-recovery process is defined in the repository.
- The development database role appears to own the database. Production should separate migration ownership from a least-privilege runtime role.
- Explicit pool, connection, statement, lock, and transaction timeouts are not configured here. Set them according to deployment capacity and observe pool saturation.

### Query-efficiency gaps

- Admin search uses case-insensitive `contains` across name, email, message, and service. These become leading-wildcard `ILIKE` predicates and ordinary B-tree indexes do not make them efficient.
- The `OR` across four text columns increases scan cost and exposes large message fields to repeated searching.
- Filtering by status/category/priority and sorting by `createdAt` will likely benefit from selected composite indexes once real query frequency is known.
- Offset pagination permits pages up to 1,000,000. Large offsets still require the database to walk and discard earlier rows.
- The list endpoint runs a count plus page query. On large data sets, exact counts can become expensive; under PostgreSQL `READ COMMITTED`, the count and page can also observe different concurrent snapshots unless stronger consistency is deliberately selected.

Recommended sequence:

1. Capture slow-query telemetry and run `EXPLAIN (ANALYZE, BUFFERS)` with production-like data.
2. If plaintext full-text search remains temporarily, use PostgreSQL `pg_trgm` GIN indexes or a purpose-built full-text/search design. PostgreSQL documents GIN/GiST trigram support for fast `LIKE`/`ILIKE` matching: [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html).
3. Add only evidence-backed composite indexes, likely beginning with common status/priority plus `createdAt` patterns.
4. Move to cursor/keyset pagination using `(createdAt, id)` for deep or continuously changing result sets.
5. After field encryption, redesign contact search around blind indexes rather than trigram indexes on plaintext PII.
6. Add reconciliation for stale `RECEIVED`/`PROCESSING` jobs and test database restore procedures.

## 9. Dependency injection and scalability

**Verdict: good application-layer separation, but runtime infrastructure is still single-process.**

Positive design:

- services receive repositories through constructors;
- analysis depends on an `AnalysisProvider` interface;
- `buildApp` can inject a fake/disabled analysis provider and logger behavior;
- routes, services, repositories, provider integration, and schema validation are separated;
- database lifecycle is isolated in a Fastify plugin.

Remaining coupling:

- configuration is imported from a process-global `env` singleton;
- the database plugin always constructs the concrete Prisma adapter/client;
- time (`Date.now()`/`new Date()`), the in-process runner, and some logging behavior are constructed internally;
- most integration tests require the real database.

The new authentication layer follows the existing boundaries: `AdminAuthService` receives `AdminSessionRepository`, while cookie parsing and route hooks remain at the HTTP edge. Time and cryptographic configuration are still concrete dependencies; injecting a clock would simplify deterministic expiry testing if session behavior grows.

Recommended evolution:

- keep `buildApp` as the composition root and allow injection of validated config, database/client, job publisher, clock, and crypto service;
- do not add interfaces mechanically—introduce them where tests, alternative implementations, or operational boundaries require them;
- move analysis execution to a durable queue/worker with idempotent jobs, bounded concurrency, retries with backoff, dead-letter handling, lease recovery, and metrics;
- use a transactional outbox or equivalent mechanism so database acceptance and job publication cannot diverge;
- use a shared rate-limit store before adding API instances;
- expose queue depth, oldest-job age, pool use, AI latency/error rate, and request-limit metrics;
- test graceful shutdown with a deadline. The current `drain()` can wait indefinitely for active work.

Stateless HTTP routes and atomic database claims are a useful starting point for horizontal scaling, but the local rate limiter and task runner currently prevent predictable multi-instance behavior.

## 10. Dependency and supply-chain status

`npm audit` reported **zero known vulnerabilities** on 2026-08-27 for both reviewed lockfiles after remediation:

- backend: 267 production dependencies and 385 total dependency nodes;
- frontend: 34 production dependencies and 60 total dependency nodes.

During implementation, npm disclosed a high-severity recursive-object stack-exhaustion advisory in `deepmerge-ts@7.1.5`, pinned by Prisma configuration tooling. Prisma 7.10 did not yet expose a compatible patched dependency. A package override now selects patched `deepmerge-ts@8.0.2`; Prisma client generation, migration deployment, type checking, builds, and the full test suite pass with the override. Keep this override under review and remove it when Prisma adopts the patched major natively.

This is a point-in-time advisory check, not proof that dependencies are safe. Keep lockfiles committed, deploy with `npm ci`, run production and full audits in CI, enable automated update/advisory tooling, and define a patch SLA. Generate an SBOM for production releases and review the security posture of the AI SDK and other high-impact transitive dependencies. The frontend manifest uses `latest` selectors; replace them with intentional compatible version ranges and let controlled update automation propose upgrades.

## Prioritized remediation plan

### P0 — before storing production customer data

1. Deploy the implemented HTTPS enforcement behind verified TLS, restrict the application port, set narrow proxy trust, and require verified PostgreSQL TLS when the database is remote.
2. Implement KMS-backed authenticated field encryption, HMAC blind indexes/fingerprints, key versioning/rotation, and a tested plaintext-to-ciphertext migration.
3. Define retention, deletion, backup encryption/expiry, and provider data-processing rules.
4. If the demo becomes private, replace the intentionally public credential with individual identity-provider accounts and MFA while retaining the session/CSRF flow.

### P1 — before public launch or horizontal scaling

1. Set and test the deployed production CORS origin, proxy trust, private session secret, TLS, and HSTS behavior.
2. Add shared rate limiting, bot controls, and AI concurrency/spend caps. Login throttling is already present but currently in-memory.
3. Move AI processing to a durable queue with recovery and backpressure.
4. Add database backups, restore drills, least-privilege roles, and operational timeouts.
5. Add a scheduled expired/revoked-session cleanup job and decide whether idle expiry is needed.

### P2 — as data volume grows

1. Measure queries, redesign encrypted-data search, and add evidence-backed indexes.
2. Replace deep offset pagination with keyset pagination.
3. Add database-enforced prompt invariants and close the duplicate-detection race if exact duplicate classification is business-critical.
4. Expand dependency injection around infrastructure boundaries and add observability/SLOs.

## Verification checklist

- [x] Application code rejects non-HTTPS production requests and emits HSTS only for HTTPS; the deployed TLS endpoint still needs external verification.
- [x] Core API security headers and authenticated `Cache-Control: no-store` behavior have automated coverage.
- [x] Approved credentialed CORS preflights pass and unapproved origins receive no CORS authorization.
- [x] Login creates an opaque signed HttpOnly session, reload restores it, CSRF-less mutations fail, and logout revokes it.
- [ ] A raw database row, dump, and backup contain no plaintext email, phone, message, or duplicated AI-extracted PII.
- [ ] Ciphertext tampering fails authentication, and old/new key versions decrypt during a tested rotation.
- [ ] Search behavior remains intentional after encryption and never requires decrypting every row.
- [ ] Rate limits hold across two API instances and identify clients correctly through the trusted proxy.
- [ ] Killing the API or worker after `202 Accepted` does not lose the analysis job or strand it permanently.
- [ ] Backup restoration and PII deletion/retention jobs are exercised in automated or scheduled operational tests.
