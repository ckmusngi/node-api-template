// Writes the OpenAPI document to docs/openapi.json (useful for client generation and CI diffing).
import fs from 'node:fs';
import { getOpenApiDocument } from '../src/docs/openapi';

fs.writeFileSync('docs/openapi.json', `${JSON.stringify(getOpenApiDocument(), null, 2)}\n`);
console.log('Wrote docs/openapi.json');
process.exit(0);
