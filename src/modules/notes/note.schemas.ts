import { NOTE_STATUSES } from '../../models/note.model';
import { listQuery, schemas } from '../../utils/validation';
import { z } from '../../utils/zod';

export const NoteSchema = z
  .object({
    id: schemas.uuid,
    userId: schemas.uuid,
    tenantId: z.uuid().nullable(),
    title: z.string().openapi({ example: 'Meeting notes' }),
    content: z.string().openapi({ example: 'Discussed the Q3 roadmap.' }),
    status: z.enum(NOTE_STATUSES),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Note');

export const createNoteBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().max(50_000),
    status: z.enum(NOTE_STATUSES).default('draft'),
  })
  .strict()
  .openapi('CreateNoteRequest');

export const updateNoteBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().max(50_000).optional(),
    status: z.enum(NOTE_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')
  .openapi('UpdateNoteRequest');

export const NOTE_SORTABLE = ['createdAt', 'updatedAt', 'title', 'status'] as const;

export const listNotesQuery = listQuery(NOTE_SORTABLE).extend({
  status: z
    .string()
    .regex(new RegExp(`^(${NOTE_STATUSES.join('|')})(,(${NOTE_STATUSES.join('|')}))*$`))
    .optional()
    .openapi({
      description: 'Comma-separated statuses',
      example: 'draft,published',
    }),
  createdFrom: schemas.isoDate.optional(),
  createdTo: schemas.isoDate.optional(),
  scope: z.enum(['own', 'all']).default('own').openapi({ description: '`all` requires the notes:read:any permission' }),
});

export type CreateNoteBody = z.infer<typeof createNoteBody>;
export type UpdateNoteBody = z.infer<typeof updateNoteBody>;
export type ListNotesQuery = z.infer<typeof listNotesQuery>;
