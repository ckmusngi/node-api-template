# Deployment guide

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` is at least 48 random bytes and comes from a secret manager, never from the image or the repo.
- [ ] `COOKIE_SECURE=true` and HTTPS terminates at the load balancer. Startup fails otherwise.
- [ ] `TRUST_PROXY` equals the number of proxies in front of the app (e.g. `1` behind an ALB), so client IPs and rate limits are correct.
- [ ] `CORS_ORIGINS` lists your front-end origins exactly. Wildcards are rejected in production.
- [ ] `DB_SSL=true` for managed databases, and `DB_POOL_MAX × instance count` is below the database's `max_connections`.
- [ ] `REDIS_ENABLED=true` when running more than one instance, so rate limits and cache are shared.
- [ ] `QUEUE_ENABLED=true` with at least one `worker` process if you want email and webhooks off the request path.
- [ ] `LOG_PRETTY=false` and `LOG_LEVEL=info`. Ship stdout to your log platform.
- [ ] Decide whether `SWAGGER_ENABLED` should be on in production.
- [ ] `npm run audit` passes and Dependabot is enabled.

## Build and run

```bash
npm ci
npm run build
npm run db:migrate:prod        # node dist/db/cli.js migrate
npm run start:prod             # node --require ./dist/instrumentation.js dist/server.js
npm run worker                 # separate process, only if QUEUE_ENABLED=true
```

Or with Docker:

```bash
docker build -t node-api-template .
docker run --env-file .env.production -p 3000:3000 node-api-template
docker run --env-file .env.production node-api-template node dist/db/cli.js migrate
```

The image is multi-stage. It runs as the non-root `node` user, uses `tini` so `SIGTERM` reaches the app, and defines a `HEALTHCHECK` on `/health`.

## Migration workflow

1. Migrations run **before** new code receives traffic, as a one-off task using the new image (see the deploy workflow).
2. Make changes backward compatible (expand, then contract):
   - Adding a column: deploy the migration, then the code that uses it.
   - Removing or renaming a column: first deploy code that no longer uses it, then a later migration removes it.
3. If a deploy fails, roll back the **code**. Only undo a migration (`node dist/db/cli.js migrate:undo`) when you know its `down` step is safe.
4. Seeding is for bootstrap only. In production the seeder creates only the admin account, and `SEED_ADMIN_PASSWORD` must be set.

## Health checks and shutdown

| Endpoint  | Use for                      | Behavior                                                        |
| --------- | ---------------------------- | --------------------------------------------------------------- |
| `/health` | Liveness / container health  | 200 while the process is serving. Never checks dependencies.    |
| `/ready`  | Readiness / LB target health | 503 when MySQL or Redis is unreachable, or while shutting down. |

On `SIGTERM`, the app:

1. Marks itself not ready.
2. Stops accepting new connections and lets in-flight requests finish.
3. Closes WebSockets, queues, Redis and the database pool.
4. Exits, with a forced exit after `SHUTDOWN_TIMEOUT_MS`.

Set your orchestrator's stop timeout (ECS `stopTimeout`, Kubernetes `terminationGracePeriodSeconds`) above `SHUTDOWN_TIMEOUT_MS`.

## AWS example (ECS Fargate)

```
Route 53 → ALB (HTTPS, ACM cert) → ECS Fargate service (api tasks, private subnets)
                                   ├─ RDS for MySQL 8 (Multi-AZ, encrypted, TLS)
                                   ├─ ElastiCache for Redis (TLS, auth)
                                   ├─ S3 bucket for uploads (private, SSE)
                                   ├─ SES for email (SMTP credentials)
                                   └─ CloudWatch Logs / X-Ray via the ADOT collector sidecar
ECS worker service (same image, command: node dist/worker.js)
```

Files:

- [deploy/aws/ecs-task-definition.json](../deploy/aws/ecs-task-definition.json): task definition with secrets from Secrets Manager, health check, logging and an OpenTelemetry collector sidecar. Replace the `<PLACEHOLDERS>`.
- [.github/workflows/deploy-aws.yml](../.github/workflows/deploy-aws.yml): manual workflow that uses GitHub OIDC to assume an IAM role (no long-lived keys), then:
  1. Builds and pushes the image to ECR.
  2. Registers a new task definition revision.
  3. Runs migrations as a one-off task and fails the deploy if they fail.
  4. Updates the service and waits for it to stabilize.

IAM permissions:

- **Execution role:** `AmazonECSTaskExecutionRolePolicy`, plus `secretsmanager:GetSecretValue` on the app secrets.
- **Task role:** `s3:PutObject` and `s3:DeleteObject` on the uploads bucket, plus permissions for the ADOT collector (`xray:PutTraceSegments`, `cloudwatch:PutMetricData`).
- **Deploy role** (GitHub OIDC):
  - `ecr:*` on the repository.
  - `ecs:RegisterTaskDefinition`, `ecs:RunTask`, `ecs:UpdateService`, `ecs:Describe*`.
  - `iam:PassRole` for the two task roles.

ALB settings:

- Target group health check path: `/ready`.
- Deregistration delay: at least `SHUTDOWN_TIMEOUT_MS`.
- Idle timeout: below the server's `keepAliveTimeout` (65s).

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs on every push and pull request:

- **quality:** typecheck, ESLint, Prettier check.
- **test:** the full Vitest suite with coverage thresholds, against MySQL 8.4 and Redis 7 service containers. The coverage report is uploaded as an artifact.
- **build:** compiles TypeScript and builds the Docker image.
- **security:** `npm audit --audit-level=high` and, on pull requests, GitHub's dependency review.

Dependabot (`.github/dependabot.yml`) opens weekly update PRs for npm packages, GitHub Actions and the Docker base image.
