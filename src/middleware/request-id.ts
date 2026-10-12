import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { requestContext } from '../utils/request-context';

const VALID_ID = /^[a-zA-Z0-9._-]{1,64}$/;
export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Accepts a well-formed incoming correlation id (e.g. from a load balancer) or creates one,
 * echoes it on the response and makes it available to every log line in this request.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  (req as { id: string }).id = id;
  req.validated = {};
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  requestContext.run({ requestId: id }, () => next());
};
