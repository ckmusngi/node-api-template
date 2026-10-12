import type { RequestHandler } from 'express';
import { Op, UniqueConstraintError } from 'sequelize';
import { env } from '../config/env';
import { IdempotencyKey } from '../models';
import { AppError, ErrorCode } from '../utils/app-error';
import { sha256 } from '../utils/crypto';
import { addDuration } from '../utils/date';
import { HttpStatus } from '../utils/http-status';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const VALID_KEY = /^[a-zA-Z0-9_-]{8,255}$/;

/**
 * Makes unsafe requests safely retryable. The first request with a given key is processed
 * and its response stored; retries with the same key and body replay that response.
 * Reusing a key with a different body is rejected (422), and a retry that arrives while
 * the first is still running gets 409.
 */
export function idempotency({ required = false } = {}): RequestHandler {
  return async (req, res, next) => {
    const key = req.get(IDEMPOTENCY_HEADER);
    if (!key) {
      return required ? next(AppError.badRequest(`${IDEMPOTENCY_HEADER} header is required`)) : next();
    }
    if (!VALID_KEY.test(key))
      return next(AppError.badRequest(`${IDEMPOTENCY_HEADER} must be 8-255 characters of [a-zA-Z0-9_-]`));

    const scope = req.user?.id ?? 'anonymous';
    const requestHash = sha256(
      JSON.stringify({
        method: req.method,
        path: req.originalUrl,
        body: (req.body as unknown) ?? null,
      }),
    );

    // Expired keys are free to reuse.
    await IdempotencyKey.destroy({
      where: { scope, key, expiresAt: { [Op.lte]: new Date() } },
    });

    let record: IdempotencyKey;
    try {
      record = await IdempotencyKey.create({
        scope,
        key,
        method: req.method,
        path: req.originalUrl.slice(0, 255),
        requestHash,
        responseStatus: null,
        responseBody: null,
        expiresAt: addDuration(new Date(), env.IDEMPOTENCY_TTL),
      });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
      const existing = await IdempotencyKey.findOne({ where: { scope, key } });
      if (!existing)
        return next(AppError.conflict('Idempotency key conflict, retry the request', ErrorCode.IDEMPOTENCY_CONFLICT));
      if (existing.requestHash !== requestHash) {
        return next(
          new AppError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            'Idempotency key was already used with a different request',
          ),
        );
      }
      if (existing.status === 'processing') {
        return next(
          AppError.conflict(
            'A request with this idempotency key is still being processed',
            ErrorCode.IDEMPOTENCY_CONFLICT,
          ),
        );
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.responseStatus ?? HttpStatus.OK);
      return existing.responseBody === null ? res.end() : res.json(existing.responseBody);
    }

    // Capture JSON bodies so they can be replayed; responses without a body (e.g. 204) store null.
    let responseBody: unknown = null;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };
    res.on('close', () => {
      if (res.writableFinished && res.statusCode < 500) {
        void record
          .update({ status: 'completed', responseStatus: res.statusCode, responseBody })
          .catch(() => undefined);
      } else {
        // Server errors and aborted requests are not stored, so the client can retry.
        void record.destroy().catch(() => undefined);
      }
    });
    next();
  };
}
