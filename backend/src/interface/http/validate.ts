import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../../shared/errors';

/**
 * Runs express-validator chains sequentially (so sanitizers mutate `req`
 * deterministically) and throws a 422 ValidationError listing every failing
 * field + its message, so clients get actionable, complete feedback.
 */
export function validate(chains: ValidationChain[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      for (const chain of chains) await chain.run(req);
      const result = validationResult(req);
      if (!result.isEmpty()) {
        const errors = result.array();
        const details = errors.map((e) => ({
          field: 'path' in e ? e.path : 'request',
          message: e.msg,
        }));
        const first = details[0];
        return next(new ValidationError(`Invalid ${first.field}: ${first.message}`, details));
      }
      next();
    } catch (err) {
      // A sanitizer/validator that rejects (rare) must reach the error
      // handler, not hang the request — this middleware isn't asyncHandler-wrapped.
      next(err);
    }
  };
}
