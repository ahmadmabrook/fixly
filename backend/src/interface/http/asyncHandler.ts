import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so rejected promises are forwarded to
 * Express's error middleware. Without this, an unawaited rejection in an
 * `async` handler escapes Express (Express 4 only catches sync throws),
 * leaving the request hanging until the client times out.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
