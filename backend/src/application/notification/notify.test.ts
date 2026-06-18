import { Prisma } from '@prisma/client';
import { createUserNotification } from './notify';

jest.mock('../../infrastructure/database/prisma', () => ({ prisma: {} }));

function client(create: jest.Mock) {
  return { notification: { create } } as unknown as Parameters<typeof createUserNotification>[0];
}

describe('createUserNotification', () => {
  it('inserts a notification row', async () => {
    const create = jest.fn().mockResolvedValue({});
    await createUserNotification(client(create), { userId: 'u1', titleAr: 't', bodyAr: 'b', bookingId: 'bk1' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', bookingId: 'bk1' }) }));
  });

  it('swallows a duplicate (P2002) so at-least-once delivery stays idempotent', async () => {
    const create = jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    await expect(createUserNotification(client(create), { userId: 'u1', titleAr: 't', bodyAr: 'b', dedupeKey: 'k' })).resolves.toBeUndefined();
  });

  it('rethrows non-duplicate errors', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(createUserNotification(client(create), { userId: 'u1', titleAr: 't', bodyAr: 'b' })).rejects.toThrow('db down');
  });
});
