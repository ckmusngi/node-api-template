import type { RequestHandler } from 'express';
import { tenantScope } from '../../middleware/tenant';
import { ApiResponse } from '../../utils/api-response';
import { auditContext } from '../audit/audit.service';
import type {
  ChangePasswordBody,
  ListUsersQuery,
  UpdateProfileBody,
  UpdateRoleBody,
  UpdateStatusBody,
} from './user.schemas';
import * as userService from './user.service';

const idOf = (req: Parameters<RequestHandler>[0]) => (req.validated.params as { id: string }).id;

export const getMe: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await userService.getProfile(req.user!.id));
};

export const updateMe: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await userService.updateProfile(req.user!.id, req.body as UpdateProfileBody, auditContext(req)));
};

export const changePassword: RequestHandler = async (req, res) => {
  const body = req.body as ChangePasswordBody;
  const tokens = await userService.changePassword(
    req.user!.id,
    body.currentPassword,
    body.newPassword,
    auditContext(req),
  );
  ApiResponse.ok(res, { message: 'Password changed. All other sessions have been signed out.', tokens });
};

export const deleteMe: RequestHandler = async (req, res) => {
  await userService.deleteOwnAccount(req.user!.id, auditContext(req));
  ApiResponse.noContent(res);
};

export const list: RequestHandler = async (req, res) => {
  const { rows, meta } = await userService.listUsers(req.validated.query as ListUsersQuery, tenantScope(req.user));
  ApiResponse.paginated(res, rows, meta);
};

export const getById: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await userService.getUser(idOf(req), tenantScope(req.user)));
};

export const updateStatus: RequestHandler = async (req, res) => {
  const user = await userService.updateStatus(
    req.user!,
    idOf(req),
    req.body as UpdateStatusBody,
    tenantScope(req.user),
    auditContext(req),
  );
  ApiResponse.ok(res, user);
};

export const updateRole: RequestHandler = async (req, res) => {
  const user = await userService.updateRole(
    req.user!,
    idOf(req),
    req.body as UpdateRoleBody,
    tenantScope(req.user),
    auditContext(req),
  );
  ApiResponse.ok(res, user);
};

export const remove: RequestHandler = async (req, res) => {
  await userService.deleteUser(req.user!, idOf(req), tenantScope(req.user), auditContext(req));
  ApiResponse.noContent(res);
};

export const restore: RequestHandler = async (req, res) => {
  ApiResponse.ok(res, await userService.restoreUser(req.user!, idOf(req), tenantScope(req.user), auditContext(req)));
};
