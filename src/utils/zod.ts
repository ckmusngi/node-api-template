import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi()` to every Zod schema so request/response schemas double as API docs.
extendZodWithOpenApi(z);

export { z };
