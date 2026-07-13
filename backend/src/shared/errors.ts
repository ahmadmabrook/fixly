export interface FieldError {
  field: string;
  message: string;
}

/**
 * Prisma's documented "known request error" codes
 * (https://www.prisma.io/docs/orm/reference/error-reference#error-codes).
 * Named here so call sites compare `err.code` against a constant instead of
 * repeating the raw code string (P2002, P2025, ...) at every catch site.
 */
export const PrismaErrorCode = {
  UNIQUE_CONSTRAINT_VIOLATION: 'P2002',
  FOREIGN_KEY_CONSTRAINT_VIOLATION: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
} as const;

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: FieldError[]) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}
