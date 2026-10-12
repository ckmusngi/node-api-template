import type { Express, RequestHandler, Router } from 'express';

export const API_PREFIX = '/api';
export const CURRENT_API_VERSION = 'v1';

export interface ApiVersionOptions {
  /** Marks the version as deprecated (RFC 9745) and announces a sunset date (RFC 8594). */
  deprecated?: boolean;
  sunset?: Date;
}

function versionHeaders(version: string, options: ApiVersionOptions): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('API-Version', version);
    if (options.deprecated) res.setHeader('Deprecation', 'true');
    if (options.sunset) res.setHeader('Sunset', options.sunset.toUTCString());
    next();
  };
}

export const versionPath = (version: string) => `${API_PREFIX}/${version}`;

/** Mounts a router under /api/<version> with version headers. */
export function mountApiVersion(app: Express, version: string, router: Router, options: ApiVersionOptions = {}) {
  app.use(versionPath(version), versionHeaders(version, options), router);
}
