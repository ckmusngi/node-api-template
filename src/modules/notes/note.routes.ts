import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { idempotency } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';
import { idParams } from '../../utils/validation';
import * as controller from './note.controller';
import { createNoteBody, listNotesQuery, updateNoteBody } from './note.schemas';

export const noteRouter = Router();

noteRouter.use(authenticate);

noteRouter.get('/', authorize('notes:read:own'), validate({ query: listNotesQuery }), controller.list);
noteRouter.post(
  '/',
  authorize('notes:write:own'),
  validate({ body: createNoteBody }),
  idempotency(),
  controller.create,
);
noteRouter.get('/:id', authorize('notes:read:own'), validate({ params: idParams }), controller.getById);
noteRouter.patch(
  '/:id',
  authorize('notes:write:own'),
  validate({ params: idParams, body: updateNoteBody }),
  controller.update,
);
noteRouter.delete('/:id', authorize('notes:write:own'), validate({ params: idParams }), controller.remove);
noteRouter.post('/:id/restore', authorize('notes:write:own'), validate({ params: idParams }), controller.restore);
