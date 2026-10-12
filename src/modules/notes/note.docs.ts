import { errors, json, paginated, registry, secured, success } from '../../docs/registry';
import { idParams } from '../../utils/validation';
import { z } from '../../utils/zod';
import { NoteSchema, createNoteBody, listNotesQuery, updateNoteBody } from './note.schemas';

const tags = ['Notes'];
const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } } },
});
const auth = { 401: errors[401], 403: errors[403] };

registry.registerPath({
  method: 'get',
  path: '/notes',
  tags,
  security: secured,
  summary: 'List notes',
  description:
    'Example of pagination, filtering, sorting and search. Try `?search=meeting&status=draft,published&sort=-createdAt&page=1&limit=10`.',
  request: { query: listNotesQuery },
  responses: {
    200: json('Notes', paginated(NoteSchema)),
    ...auth,
    422: errors[422],
  },
});
registry.registerPath({
  method: 'post',
  path: '/notes',
  tags,
  security: secured,
  summary: 'Create a note',
  description:
    'Send an `Idempotency-Key` header to make retries safe: repeated requests with the same key replay the original response.',
  request: {
    headers: z.object({
      'Idempotency-Key': z.string().min(8).max(255).optional().openapi({ example: 'create-note-7f3a9c21' }),
    }),
    ...body(createNoteBody),
  },
  responses: {
    201: json('Created', success(NoteSchema)),
    ...auth,
    409: errors[409],
    422: errors[422],
  },
});
registry.registerPath({
  method: 'get',
  path: '/notes/{id}',
  tags,
  security: secured,
  summary: 'Get a note',
  request: { params: idParams },
  responses: {
    200: json('Note', success(NoteSchema)),
    ...auth,
    404: errors[404],
  },
});
registry.registerPath({
  method: 'patch',
  path: '/notes/{id}',
  tags,
  security: secured,
  summary: 'Update a note',
  request: { params: idParams, ...body(updateNoteBody) },
  responses: {
    200: json('Note', success(NoteSchema)),
    ...auth,
    404: errors[404],
    422: errors[422],
  },
});
registry.registerPath({
  method: 'delete',
  path: '/notes/{id}',
  tags,
  security: secured,
  summary: 'Soft delete a note',
  request: { params: idParams },
  responses: { 204: { description: 'Deleted' }, ...auth, 404: errors[404] },
});
registry.registerPath({
  method: 'post',
  path: '/notes/{id}/restore',
  tags,
  security: secured,
  summary: 'Restore a soft-deleted note',
  request: { params: idParams },
  responses: {
    200: json('Note', success(NoteSchema)),
    ...auth,
    404: errors[404],
    409: errors[409],
  },
});
