import type { RequestHandler } from 'express';
import { ApiResponse } from '../../utils/api-response';
import { auditContext } from '../audit/audit.service';
import type { CreateNoteBody, ListNotesQuery, UpdateNoteBody } from './note.schemas';
import * as noteService from './note.service';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.validated.params as { id: string }).id;

export const list: RequestHandler = async (req, res) => {
  const { rows, meta } = await noteService.listNotes(req.user!, req.validated.query as ListNotesQuery);
  ApiResponse.paginated(res, rows, meta);
};

export const getById: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await noteService.getNote(req.user!, idOf(req)));
};

export const create: RequestHandler = async (req, res) => {
  ApiResponse.created(res, await noteService.createNote(req.user!, req.body as CreateNoteBody, auditContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  ApiResponse.ok(
    res,
    await noteService.updateNote(req.user!, idOf(req), req.body as UpdateNoteBody, auditContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  await noteService.deleteNote(req.user!, idOf(req), auditContext(req));
  ApiResponse.noContent(res);
};

export const restore: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await noteService.restoreNote(req.user!, idOf(req), auditContext(req)));
};
