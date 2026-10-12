# node-api-template

A production-ready REST API template: **Node.js 22 · TypeScript · Express 5 · MySQL · Sequelize · Zod · Pino**.

It includes authentication with rotating refresh tokens, RBAC, validated and documented endpoints, migrations, structured logging, tests against a real database, CI, and Docker/AWS deployment examples. Redis caching, BullMQ jobs, WebSockets, multi-tenancy and OpenTelemetry are built in and switched on with env flags.

- [Quick start](#quick-start)
- [Running with Docker](#running-with-docker)
- [Local MySQL setup](#local-mysql-setup)
- [Project structure](#project-structure)
- [Features](#features)
- [Scripts](#scripts)
- [Database workflow](#database-workflow)
- [Testing](#testing)
- [Optional features](#optional-features)
- [Adding a new resource](#adding-a-new-resource)
- [API usage guide](docs/api.md) · [Deployment guide](docs/deployment.md)

## Quick start

There are two ways to run the template locally:

|                                                     | You need                                            | Best for                                                   |
| --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| **A. Node on your machine** (below)                 | Node 22+, plus MySQL from a local install or Docker | Day-to-day development, with hot reload and tests          |
| **B. [Everything in Docker](#running-with-docker)** | Docker only                                         | Trying the template, or running it the way production does |

### A. Run with Node

```bash
# 1. Install dependencies (Node 22+, see .nvmrc)
npm install

# 2. Configure
cp .env.example .env
#    Set JWT_ACCESS_SECRET in .env to the output of:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Start MySQL (and Redis, for the optional features). Pick one:
docker compose up -d mysql redis    # Docker: then set DB_PASSWORD=root in .env
brew services start mysql           # or a local install, see "Local MySQL setup"

# 4. Create the schema and demo data
npm run db:create
npm run db:migrate
npm run db:seed

# 5. Start the API with hot reload
npm run dev
```

Once the server is running:

- **Swagger UI:** <http://localhost:3000/docs>. The raw spec is at `/docs/openapi.json`.
- **Health:** `/health` (liveness) and `/ready` (readiness).
- **Demo accounts** (created by the seeder):

  | Account | Email               | Password       |
  | ------- | ------------------- | -------------- |
  | Admin   | `admin@example.com` | `Password123!` |
  | User    | `user@example.com`  | `Password123!` |

Every variable in `.env` is validated at startup by [src/config/env.ts](src/config/env.ts). If any are missing or invalid, the app lists them and exits. It only prints variable names, never their values.

## Running with Docker

The repo ships a production [Dockerfile](Dockerfile) and a [docker-compose.yml](docker-compose.yml). With only Docker installed, one command builds the image and starts MySQL, Redis, the API and the background worker:

```bash
docker compose --profile app up --build
```

The `migrate` service runs migrations and the seeder once, then exits. The API and worker start only after it succeeds. When it's up:

- API: <http://localhost:3000>
- Swagger UI: <http://localhost:3000/docs>
- Health: <http://localhost:3000/ready>
- Admin login: `admin@example.com` / `Password123!`

Production mode only seeds the admin account, so the demo user isn't created.

Useful commands:

```bash
docker compose --profile app up --build -d        # run in the background
docker compose logs -f api worker                 # follow logs
docker compose --profile app run --rm migrate     # rerun migrations after pulling new ones
docker compose --profile app down                 # stop (data is kept)
docker compose --profile app down -v              # stop and delete the database and uploads
```

**Ports already in use?** If MySQL, Redis or another app already uses 3306, 6379 or 3000 on your machine (for example a Homebrew install), pick other host ports:

```bash
MYSQL_PORT=3307 REDIS_PORT=6380 API_PORT=3001 docker compose --profile app up --build
```

**Configuration:**

- The containers read `.env` if it exists. The compose file then overrides the database and Redis settings so they point at the compose services.
- The containers run with `NODE_ENV=production`, Redis and queues enabled, and plain JSON logs.
- `JWT_ACCESS_SECRET` and `SEED_ADMIN_PASSWORD` fall back to local-only defaults. Set them in your shell or `.env` for anything beyond local testing.
- The refresh cookie is marked `Secure`. Browsers still accept it on `http://localhost`. Non-browser clients send the refresh token in the request body.

**Only the databases in Docker:** `docker compose up -d mysql redis` starts MySQL 8.4 (root password `root`) and Redis 7 without the app, for use with `npm run dev` (option A). Set `DB_PASSWORD=root` in `.env`.

The image builds in two stages and runs as a non-root user. It includes a health check, and SIGTERM triggers graceful shutdown. For production deployment, see the [deployment guide](docs/deployment.md).

## Local MySQL setup

**Docker:** `docker compose up -d mysql`. This starts MySQL 8.4 on `127.0.0.1:3306` (or `MYSQL_PORT`) with root password `root`. Set `DB_PASSWORD=root` in `.env`.

**Homebrew (macOS):**

```bash
brew install mysql
brew services start mysql
mysql -uroot -e "SELECT VERSION();"     # root has no password by default
```

**Linux (Debian/Ubuntu):**

```bash
sudo apt install mysql-server
sudo mysql -e "CREATE USER 'app'@'localhost' IDENTIFIED BY 'app'; GRANT ALL ON \`node_api_template%\`.* TO 'app'@'localhost';"
```

Then set `DB_USER`/`DB_PASSWORD` in `.env`. Tests use separate databases (`node_api_template_test`, `node_api_template_optional_test`), so the DB user also needs permission to create and drop those.

## Project structure

```
src/
  app.ts                 Express app factory (middleware order lives here)
  server.ts              HTTP server bootstrap + graceful shutdown
  worker.ts              BullMQ worker process
  instrumentation.ts     OpenTelemetry bootstrap (loaded with --require)
  config/                env validation, logger, database, RBAC roles/permissions
  db/                    Umzug migrator, CLI, migrations/, seeders/
  models/                Sequelize models + associations (models/index.ts)
  modules/<feature>/     routes, controller, service, schemas, docs per feature
    auth/  users/  notes/  audit/  health/  uploads/  webhooks/
  middleware/            request id, logging, validation, authn/authz, rate limit,
                         idempotency, tenant, error handling
  lib/                   redis, cache, queue, mailer, storage, http client,
                         websocket, metrics, lifecycle
  utils/                 responses, errors, status codes, pagination, query
                         builders, CRUD repository, dates, crypto, validation
  docs/                  OpenAPI registry + document generator
  routes/v1.ts           mounts feature routers under /api/v1
tests/
  unit/                  pure functions and libraries
  integration/           HTTP tests against a real MySQL test database
  optional/              same, with Redis/queues/WebSockets/multi-tenancy enabled
  helpers/               DB reset, per-test truncation, factories
deploy/aws/              ECS Fargate task definition example
docs/                    API usage and deployment guides
```

Each feature module follows the same layering: **routes** (validation and permissions) → **controller** (HTTP in/out) → **service** (business rules, transactions, auditing) → **models**.

## Features

### Core architecture

- TypeScript in strict mode, compiled to CommonJS.
- Zod-validated configuration, with `.env.<NODE_ENV>` layered over `.env`.
- Centralized error handling. Expected errors are `AppError` instances. Sequelize, Zod, Multer and body-parser errors are mapped to consistent responses. In production, unexpected errors return a generic message.
- Every response uses the same envelope:
  - Success: `{ success: true, data, meta?, requestId }`
  - Error: `{ success: false, error: { code, message, details? }, requestId }`
- API versioning under `/api/v1`, with an `API-Version` header and optional `Deprecation`/`Sunset` headers. See [src/utils/api-version.ts](src/utils/api-version.ts).
- Request correlation: `X-Request-ID` is accepted or generated, echoed on the response, and attached to every log line through `AsyncLocalStorage`.

### Authentication and authorization

- Register, login, logout, and logout-all.
- Short-lived JWT access tokens (HS256, with issuer and audience checks).
- Refresh tokens:
  - Opaque random strings, stored only as SHA-256 hashes.
  - Rotated on every use.
  - Reusing an old token revokes the whole session family (theft detection).
  - Delivered as an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`, and also in the body for non-browser clients.
- bcrypt password hashing. Login runs a dummy hash for unknown emails so timing doesn't reveal which accounts exist.
- RBAC: roles map to permissions in [src/config/rbac.ts](src/config/rbac.ts). Routes check permissions with `authorize('notes:write:own')`.
- Resource-level authorization: services check ownership. A resource the caller isn't allowed to see returns 404, so its existence isn't revealed.
- Forgot/reset password and email verification use single-use, hashed, expiring tokens. Forgot-password always returns 202, so it can't be used to discover accounts.
- Account status (`active`, `inactive`, `suspended`) is enforced on every request. Suspending or deactivating a user revokes their sessions immediately.
- Changing or resetting a password invalidates all existing access tokens (password-version claim) and refresh tokens.

### Database

- MySQL through Sequelize, with UTC timestamps, `utf8mb4` and a configurable connection pool.
- Migrations and seeders are plain TypeScript run by Umzug. History is tracked in `sequelize_migrations` and `sequelize_seeders`, and is shared between `src/` and `dist/` runs.
- Associations, transactions (registration, rotation, resets, status changes) and soft deletes (`paranoid` users and notes, with restore endpoints).
- A generic CRUD repository ([src/utils/crud.ts](src/utils/crud.ts)) handles pagination, whitelisted filtering and sorting, LIKE-escaped search, and a `scope` for ownership or tenancy.
- Database checks run in `/ready`.

### Security

- Input validation:
  - Zod validates every input. Unknown body fields are stripped, or rejected on `strict` schemas, which prevents mass assignment.
  - Sort fields are whitelisted and search input is LIKE-escaped. Sequelize parameterizes every query, which protects against SQL injection.
- HTTP hardening:
  - Helmet security headers.
  - CORS allowlist (`CORS_ORIGINS`).
  - Request body size limits (`BODY_LIMIT`).
  - `x-powered-by` disabled.
- Throttling:
  - A global rate limit plus a stricter limit on auth endpoints. Limits are shared through Redis when it's enabled.
  - Accounts lock after `LOGIN_MAX_ATTEMPTS` failed logins.
- Sensitive data is redacted from logs: authorization headers, cookies, passwords and tokens.
- In production, startup fails if `COOKIE_SECURE` is false or CORS allows a wildcard.
- Uploads are checked against a MIME allowlist and their magic bytes, stored under generated keys, and size-limited.

### Logging and monitoring

- Pino structured JSON logs (pretty-printed in development), with HTTP request logs from `pino-http`.
- `/health` is the liveness probe and never touches dependencies. `/ready` checks MySQL, Redis (if enabled) and shutdown state.
- Graceful shutdown on SIGTERM/SIGINT:
  1. `/ready` starts reporting 503.
  2. The server stops accepting new connections and in-flight requests finish.
  3. Shutdown hooks close WebSockets, queues, Redis and the database.
  4. A timeout guards the whole process.
- OpenTelemetry traces and metrics (HTTP, Express, mysql2, ioredis, Pino), plus custom request-duration and auth-event metrics.

## Scripts

| Script                                   | Purpose                                                      |
| ---------------------------------------- | ------------------------------------------------------------ |
| `npm run dev` / `dev:worker`             | API / worker with hot reload (tsx)                           |
| `npm run build`                          | Compile to `dist/`                                           |
| `npm start` / `start:prod` / `worker`    | Run the compiled API / worker                                |
| `npm test`                               | All tests (core + optional projects)                         |
| `npm run test:unit` / `test:integration` | Subsets                                                      |
| `npm run test:coverage`                  | Tests + coverage report in `coverage/` (thresholds enforced) |
| `npm run lint` / `lint:fix`              | ESLint (type-aware)                                          |
| `npm run format` / `format:check`        | Prettier                                                     |
| `npm run typecheck`                      | TypeScript, including tests                                  |
| `npm run validate`                       | typecheck + lint + format check + tests                      |
| `npm run audit`                          | `npm audit --audit-level=high`                               |
| `npm run docs:export`                    | Write `docs/openapi.json`                                    |
| `npm run db:*`                           | Database commands (next section)                             |

## Database workflow

```bash
npm run migration:create -- add-phone-to-users   # scaffolds src/db/migrations/<timestamp>-add-phone-to-users.ts
npm run db:migrate            # apply pending migrations
npm run db:migrate:status     # list executed / pending
npm run db:migrate:undo       # revert the last migration
npm run db:seed               # run seeders (demo data is skipped in production)
npm run db:reset              # drop, create, migrate, seed (refuses in production)
npm run db:migrate:prod       # from a build: node dist/db/cli.js migrate
```

Rules of thumb:

- Never edit a migration that has already run in a shared environment. Add a new one instead.
- Keep migrations backward compatible with the currently deployed code (expand, then contract), because migrations run before the new version takes traffic.
- Update the matching model in `src/models/` alongside each migration.

## Testing

```bash
npm test                 # needs MySQL; the "optional" project also needs Redis
npm run test:coverage
```

How the test setup works:

- **Isolated databases:** `tests/helpers/global-setup.ts` drops and recreates the test databases and runs migrations. It refuses any database name that doesn't end in `_test`.
- **Clean state:** every test starts with truncated tables and empty in-memory mail and cache.
- **Two Vitest projects:**
  - `core`: unit and integration tests with default settings.
  - `optional`: Redis cache and rate limiting, BullMQ, WebSockets and multi-tenancy switched on. It uses Redis DB 15, or `TEST_REDIS_URL`.
- **Configuration:** test settings live in `.env.test`, including a low bcrypt cost and `LOGIN_MAX_ATTEMPTS=3`.

## Optional features

All of these are off by default, so the template runs with nothing but MySQL.

| Flag / setting               | What it enables                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_ENABLED=true`         | Redis-backed cache (profile reads), distributed rate limiting, and webhook dedupe. Otherwise an in-memory fallback is used.        |
| `QUEUE_ENABLED=true`         | BullMQ queues for email and webhooks, with retries and exponential backoff. Run `npm run worker`. Without it, jobs run inline.     |
| `MAIL_TRANSPORT=smtp`        | Real email over SMTP (e.g. AWS SES). The default `json` transport only logs messages.                                              |
| `STORAGE_DRIVER=s3`          | Uploads go to S3 with server-side encryption. The default writes to `uploads/` and serves it at `/uploads` with a restrictive CSP. |
| `WEBHOOK_SECRET`             | `POST /api/v1/webhooks/:provider`: HMAC-SHA256 signature over `timestamp.body`, a replay window, and duplicate-event dedupe.       |
| `Idempotency-Key` header     | Safe retries for `POST /notes`. Add `idempotency()` to any route.                                                                  |
| `MULTI_TENANCY_ENABLED=true` | Users and notes belong to a tenant (`X-Tenant-Slug` on registration). Queries are scoped to the caller's tenant.                   |
| `WS_ENABLED=true`            | WebSocket server at `/ws`. Authenticate with `new WebSocket(url, ['bearer', accessToken])`. Note events are pushed live.           |
| `OTEL_ENABLED=true`          | OpenTelemetry traces and metrics exported over OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`.                                         |
| `src/lib/http-client.ts`     | Axios factory for external APIs: timeouts, retries on idempotent requests, and request-ID propagation.                             |

Audit logs are always on. Security and admin actions are recorded in `audit_logs` and can be queried at `GET /api/v1/audit-logs` (admin only).

## Adding a new resource

1. **Migration:** `npm run migration:create -- create-projects`, then define the table.
2. **Model:** `src/models/project.model.ts`. Register it and its associations in `src/models/index.ts`.
3. **Schemas:** `modules/projects/project.schemas.ts` with Zod body and query schemas. Use `listQuery([...sortable])` for list endpoints.
4. **Service:** build on `createCrudRepository({ model, sortable, searchable, filters })`. Pass an ownership or tenant `scope` and call `recordAudit` for important changes.
5. **Controller and routes:** use `authenticate`, `authorize(...)` and `validate({ params, query, body })`. Add new permissions in `config/rbac.ts`.
6. **Mount and document:** mount the router in `routes/v1.ts`. Register its paths in `modules/projects/project.docs.ts` and import that file in `docs/openapi.ts`.
7. **Tests:** add integration tests in `tests/integration/`, and add the new table to the truncation list in `tests/helpers/setup.ts`.

`modules/notes` is the reference implementation.
