# API usage guide

The interactive reference lives at **`/docs`** (Swagger UI), and the machine-readable spec at **`/docs/openapi.json`**. This page walks through common flows with `curl`.

```bash
API=http://localhost:3000/api/v1
```

## Response format

Every response from `/api/v1` uses the same envelope and includes the request's correlation id.

**Success:**

```json
{
  "success": true,
  "data": { "id": "3f1c2b8e-...", "title": "Meeting notes" },
  "requestId": "8d4f0b8e-1f0c-4b8e-9f62-2a6b52b3f7a1"
}
```

**List:**

```json
{
  "success": true,
  "data": [ ... ],
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNextPage": true, "hasPrevPage": false } },
  "requestId": "..."
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": "body.email", "message": "Invalid email address", "code": "invalid_format" }]
  },
  "requestId": "..."
}
```

| Status | `error.code`                                                               | Meaning                                                   |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| 400    | `BAD_REQUEST`                                                              | Malformed request (e.g. invalid JSON)                     |
| 401    | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `INVALID_TOKEN`    | Authentication failed. On `TOKEN_EXPIRED`, refresh.       |
| 403    | `FORBIDDEN`, `ACCOUNT_SUSPENDED`, `ACCOUNT_INACTIVE`, `EMAIL_NOT_VERIFIED` | Authenticated but not allowed                             |
| 404    | `NOT_FOUND`                                                                | Missing, or not visible to you                            |
| 409    | `CONFLICT`, `IDEMPOTENCY_CONFLICT`                                         | Duplicate, or an idempotent request in progress           |
| 413    | `PAYLOAD_TOO_LARGE`                                                        | Body or file too large                                    |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                                                   | File type not allowed                                     |
| 422    | `VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`                                 | Invalid input, or a key reused with a different body      |
| 423    | `ACCOUNT_LOCKED`                                                           | Too many failed logins; try again later                   |
| 429    | `RATE_LIMITED`                                                             | Slow down (see the `RateLimit` and `Retry-After` headers) |
| 500    | `INTERNAL_ERROR`                                                           | Unexpected error (details hidden in production)           |

## Authentication

### Register

```bash
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"Sup3rSecret!","firstName":"Jane","lastName":"Doe"}'
```

Returns `201` with the user. A verification email is sent. With `MAIL_TRANSPORT=json`, the link appears in the server logs.

### Log in

```bash
curl -s -c cookies.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"Sup3rSecret!"}'
```

```json
{
  "success": true,
  "data": {
    "user": { "id": "…", "email": "jane@example.com", "role": "user", "status": "active", "...": "..." },
    "tokens": {
      "tokenType": "Bearer",
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "expiresIn": 900,
      "refreshToken": "b3JkZXItYS1yYW5kb20t...",
      "refreshTokenExpiresAt": "2026-10-19T08:00:00.000Z"
    }
  },
  "requestId": "…"
}
```

Use the access token on protected endpoints:

```bash
TOKEN=eyJhbGciOiJIUzI1NiIs...
curl -s $API/users/me -H "Authorization: Bearer $TOKEN"
```

### Refresh

Browsers send the `refresh_token` cookie automatically, so they only need `credentials: 'include'`. Other clients send the token in the body:

```bash
curl -s -X POST $API/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"b3JkZXItYS1yYW5kb20t..."}'
```

Each refresh token works **once**. Always store the new one from the response. If an old token is presented again, every session in that chain is revoked and the user must sign in again.

### Log out

```bash
curl -s -b cookies.txt -X POST $API/auth/logout -H "Authorization: Bearer $TOKEN"       # this session
curl -s -X POST $API/auth/logout-all -H "Authorization: Bearer $TOKEN"                   # every session
```

### Password reset and email verification

```bash
curl -s -X POST $API/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"jane@example.com"}'
curl -s -X POST $API/auth/reset-password  -H 'Content-Type: application/json' -d '{"token":"<from email>","password":"N3wPassword!"}'
curl -s -X POST $API/auth/verify-email    -H 'Content-Type: application/json' -d '{"token":"<from email>"}'
```

## Lists: pagination, filtering, sorting, search

```bash
curl -s "$API/notes?page=2&limit=10&sort=-createdAt,title&search=roadmap&status=draft,published&createdFrom=2026-01-01" \
  -H "Authorization: Bearer $TOKEN"
```

| Parameter        | Notes                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `page`, `limit`  | `limit` is capped at 100                                           |
| `sort`           | Comma-separated whitelisted fields; prefix with `-` for descending |
| `search`         | Case-insensitive contains match; `%` and `_` are matched literally |
| resource filters | Documented per endpoint (e.g. `status`, `role`, `createdFrom`)     |

## Idempotent requests

```bash
curl -s -X POST $API/notes -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1c0b8e-create-note' -d '{"title":"Roadmap","content":"Q3 plan"}'
```

Repeating the request with the same key returns the original response, with `Idempotent-Replayed: true`. Reusing the key with a different body returns `422`. Keys expire after `IDEMPOTENCY_TTL`.

## Uploads

```bash
curl -s -X POST $API/uploads -H "Authorization: Bearer $TOKEN" -F "file=@./avatar.png;type=image/png"
```

## Webhooks

Senders sign the payload with the shared `WEBHOOK_SECRET`:

```bash
BODY='{"id":"evt_123","type":"invoice.paid","data":{"amount":4200}}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -s -X POST $API/webhooks/billing -H 'Content-Type: application/json' \
  -H "X-Webhook-Signature: t=$TS,v1=$SIG" -d "$BODY"
```

## WebSocket (when `WS_ENABLED=true`)

```js
const ws = new WebSocket('ws://localhost:3000/ws', ['bearer', accessToken]);
ws.onmessage = (e) => console.log(JSON.parse(e.data)); // { event: 'note.created', data: {...} }
```

## Correlation ids

Send `X-Request-ID: <your-id>` (1–64 characters of `[A-Za-z0-9._-]`) to trace a request through the logs. Otherwise one is generated. Either way, the id is returned in the `X-Request-ID` header and in `requestId`.
