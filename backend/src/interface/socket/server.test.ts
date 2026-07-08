import http from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import { createSocketServer } from './server';
import { signJwt } from '../../shared/jwt';

jest.mock('../../infrastructure/database/prisma', () => ({
  prisma: {
    technicianProfile: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
  },
}));

function sign(claims: { typ: 'user' | 'admin'; audience: string }): string {
  return signJwt(
    { userId: 'u1', role: claims.typ === 'admin' ? 'ADMIN' : 'CUSTOMER', typ: claims.typ },
    { issuer: 'fixly', audience: claims.audience, expiresIn: '5m' },
  );
}

/** Try to connect; resolve 'connected' or 'error' (never hangs). */
function attempt(port: number, token?: string): Promise<'connected' | 'error'> {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: 2000,
    });
    client.on('connect', () => { client.close(); resolve('connected'); });
    client.on('connect_error', () => { client.close(); resolve('error'); });
  });
}

describe('socket handshake auth', () => {
  let server: http.Server;
  let io: SocketServer;
  let port: number;

  beforeAll(async () => {
    server = http.createServer();
    io = createSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts a valid user token', async () => {
    expect(await attempt(port, sign({ typ: 'user', audience: 'fixly-app' }))).toBe('connected');
  });

  it('rejects a connection with no token', async () => {
    expect(await attempt(port)).toBe('error');
  });

  it('rejects an admin-class token (admins have no socket surface)', async () => {
    expect(await attempt(port, sign({ typ: 'admin', audience: 'fixly-admin' }))).toBe('error');
  });

  it('rejects a garbage token', async () => {
    expect(await attempt(port, 'not-a-jwt')).toBe('error');
  });
});
