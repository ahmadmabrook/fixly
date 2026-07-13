import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, PrismaErrorCode } from '../../../shared/errors';
import { logger } from '../../../shared/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? 'ERROR',
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped.status >= 500) logger.error({ err, code: err.code }, 'Prisma error');
    res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    return;
  }

  // body-parser marks malformed JSON with type 'entity.parse.failed'.
  if (err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    return;
  }

  // Attach request id from pino-http for correlation when triaging.
  const reqId = (req as { id?: string }).id;
  logger.error({ err, reqId }, 'Unhandled error');
  // Echo the request id back so the client can quote it in a support ticket
  // and the operator can grep pino logs for the matching record.
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', ...(reqId ? { reqId } : {}) },
  });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
} {
  switch (err.code) {
    case PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION:
      return { status: 409, code: 'CONFLICT', message: 'Resource already exists' };
    case PrismaErrorCode.FOREIGN_KEY_CONSTRAINT_VIOLATION:
      return { status: 422, code: 'FK_VIOLATION', message: 'Referenced resource does not exist' };
    case PrismaErrorCode.RECORD_NOT_FOUND:
      return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
    default:
      return { status: 500, code: 'DB_ERROR', message: 'Database error' };
  }
}
