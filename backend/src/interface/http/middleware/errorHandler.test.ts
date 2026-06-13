import { errorHandler } from './errorHandler';
import { AppError } from '../../../shared/errors';

function mockReqRes(reqId?: string) {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as { status: jest.Mock; json: jest.Mock };
  const req = { id: reqId } as unknown as { id?: string };
  const next = jest.fn();
  return { req, res, next };
}

describe('errorHandler', () => {
  it('echoes the request id on an unhandled 5xx', () => {
    const { req, res, next } = mockReqRes('req-test-xyz');
    errorHandler(new Error('boom'), req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        reqId: 'req-test-xyz',
      }),
    });
  });

  it('omits reqId when the request has no id', () => {
    const { req, res, next } = mockReqRes(undefined);
    errorHandler(new Error('boom'), req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  it('maps AppError to the right status + code without a reqId', () => {
    const { req, res, next } = mockReqRes();
    const err = new AppError('teapot', 418, 'IM_A_TEAPOT');
    errorHandler(err, req as never, res as never, next);
    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'IM_A_TEAPOT', message: 'teapot' },
    });
  });
});
