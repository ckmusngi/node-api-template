import type { WhereOptions } from 'sequelize';
import { hasPermission } from '../../config/rbac';
import { notifyUser } from '../../lib/websocket';
import { canAccess } from '../../middleware/authorize';
import { tenantScope } from '../../middleware/tenant';
import { Note, sequelize } from '../../models';
import { AppError } from '../../utils/app-error';
import { createCrudRepository } from '../../utils/crud';
import { recordAudit } from '../audit/audit.service';
import type { RequestMeta } from '../auth/auth.service';
import { NOTE_SORTABLE, type CreateNoteBody, type ListNotesQuery, type UpdateNoteBody } from './note.schemas';

export const noteRepository = createCrudRepository({
  model: Note,
  name: 'Note',
  sortable: NOTE_SORTABLE,
  searchable: ['title', 'content'],
  filters: {
    status: { op: 'in' },
    createdFrom: { op: 'gte', column: 'createdAt' },
    createdTo: { op: 'lte', column: 'createdAt' },
  },
});

/**
 * Resource-level authorization: loads the note within the caller's tenant and checks
 * ownership. Notes the caller may not access are reported as 404 so their existence
 * is not revealed.
 */
async function loadAccessible(
  user: Express.AuthUser,
  id: string,
  permission: 'notes:read:any' | 'notes:write:any',
  paranoid = true,
) {
  const note = await noteRepository.findById(id, tenantScope(user), {
    paranoid,
  });
  if (!canAccess(user, note.userId, permission)) throw AppError.notFound('Note');
  return note;
}

export function listNotes(user: Express.AuthUser, query: ListNotesQuery) {
  if (query.scope === 'all' && !hasPermission(user.role, 'notes:read:any')) throw AppError.forbidden();
  const scope: WhereOptions = {
    ...tenantScope(user),
    ...(query.scope === 'own' ? { userId: user.id } : {}),
  };
  return noteRepository.list(query, scope);
}

export function getNote(user: Express.AuthUser, id: string) {
  return loadAccessible(user, id, 'notes:read:any');
}

export async function createNote(user: Express.AuthUser, input: CreateNoteBody, meta: RequestMeta) {
  const note = await sequelize.transaction(async (transaction) => {
    const created = await noteRepository.create({ ...input, userId: user.id, tenantId: user.tenantId }, transaction);
    await recordAudit(
      {
        action: 'note.created',
        actorId: user.id,
        entityType: 'note',
        entityId: created.id,
      },
      meta,
      transaction,
    );
    return created;
  });
  notifyUser(user.id, 'note.created', note);
  return note;
}

export async function updateNote(user: Express.AuthUser, id: string, input: UpdateNoteBody, meta: RequestMeta) {
  const note = await loadAccessible(user, id, 'notes:write:any');
  await noteRepository.update(note, input);
  await recordAudit(
    {
      action: 'note.updated',
      actorId: user.id,
      entityType: 'note',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    },
    meta,
  );
  notifyUser(note.userId, 'note.updated', note);
  return note;
}

export async function deleteNote(user: Express.AuthUser, id: string, meta: RequestMeta) {
  const note = await loadAccessible(user, id, 'notes:write:any');
  await noteRepository.remove(note);
  await recordAudit(
    {
      action: 'note.deleted',
      actorId: user.id,
      entityType: 'note',
      entityId: id,
    },
    meta,
  );
  notifyUser(note.userId, 'note.deleted', { id });
}

export async function restoreNote(user: Express.AuthUser, id: string, meta: RequestMeta) {
  const note = await loadAccessible(user, id, 'notes:write:any', false);
  if (!note.deletedAt) throw AppError.conflict('Note is not deleted');
  await note.restore();
  await recordAudit(
    {
      action: 'note.restored',
      actorId: user.id,
      entityType: 'note',
      entityId: id,
    },
    meta,
  );
  return note;
}
