import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { env } from '../config/env';
import { CURRENT_API_VERSION, versionPath } from '../utils/api-version';
import { registry } from './registry';

// Each module registers its paths when imported.
import '../modules/auth/auth.docs';
import '../modules/users/user.docs';
import '../modules/notes/note.docs';
import '../modules/audit/audit.routes';
import '../modules/uploads/upload.routes';
import '../modules/webhooks/webhook.routes';
import '../modules/health/health.routes';

const description = `
Production-ready REST API template.

## Authentication
1. \`POST /auth/register\` then \`POST /auth/login\` to receive an **access token** (JWT, ${env.JWT_ACCESS_TTL}) and a **refresh token** (${env.REFRESH_TOKEN_TTL}).
2. Send \`Authorization: Bearer <accessToken>\` on protected endpoints (use the **Authorize** button above).
3. When the access token expires (\`401 TOKEN_EXPIRED\`), call \`POST /auth/refresh\`. Refresh tokens rotate on every use; reusing an old one revokes the session.

## Conventions
- Success: \`{ "success": true, "data": ..., "meta"?: ..., "requestId": "..." }\`
- Error: \`{ "success": false, "error": { "code", "message", "details"? }, "requestId": "..." }\`
- Lists accept \`page\`, \`limit\` (max 100), \`sort\` (\`-createdAt,title\`) and \`search\`.
- Every response carries \`X-Request-ID\`; send your own to correlate logs.
`;

let cached: ReturnType<OpenApiGeneratorV31['generateDocument']> | undefined;

export function getOpenApiDocument() {
  cached ??= new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: env.APP_NAME, version: '1.0.0', description },
    servers: [
      {
        url: versionPath(CURRENT_API_VERSION),
        description: `API ${CURRENT_API_VERSION}`,
      },
    ],
    tags: [
      { name: 'Auth' },
      { name: 'Users' },
      { name: 'Users (admin)' },
      {
        name: 'Notes',
        description: 'Example resource showing CRUD, ownership checks and soft deletes',
      },
      { name: 'Uploads' },
      { name: 'Webhooks' },
      { name: 'Audit' },
      { name: 'Health' },
    ],
  });
  return cached;
}
