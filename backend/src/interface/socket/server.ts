import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../../shared/logger';
import { env } from '../../shared/env';
import { prisma } from '../../infrastructure/database/prisma';
import type { AuthPayload } from '../http/middleware/auth';

interface LocationPayload {
  bookingId: string;
  lat: number;
  lng: number;
}

function isLocationPayload(p: unknown): p is LocationPayload {
  if (typeof p !== 'object' || p === null) return false;
  const v = p as LocationPayload;
  return (
    typeof v.bookingId === 'string' &&
    typeof v.lat === 'number' && v.lat >= -90 && v.lat <= 90 &&
    typeof v.lng === 'number' && v.lng >= -180 && v.lng <= 180
  );
}

/**
 * Resolve + cache the caller's technician profile id on the socket. The
 * userId→profile mapping is immutable for a session, so we fetch it at most
 * once instead of on every (high-frequency) location event.
 */
async function techProfileId(socket: { data: { techProfileId?: string | null } }, userId: string): Promise<string | null> {
  if (socket.data.techProfileId !== undefined) return socket.data.techProfileId;
  const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
  socket.data.techProfileId = profile?.id ?? null;
  return socket.data.techProfileId;
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: env().CORS_ORIGIN },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      // Mirror the HTTP verifier exactly: pin alg + issuer + audience, and only
      // accept user-class tokens (admins have no socket surface).
      const payload = jwt.verify(token, env().JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'fixly',
        audience: 'fixly-app',
      }) as AuthPayload;
      if (payload.typ !== 'user') return next(new Error('Unauthorized'));
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data.user as AuthPayload;
    logger.debug({ userId }, 'Socket connected');

    // Personal room for direct notifications (booking status, etc.)
    socket.join(`user:${userId}`);

    // Bookings this socket has proven it is the ASSIGNED technician for. A
    // booking's assignment is immutable once set, so we verify once (on join)
    // and skip the per-ping DB lookup on the hot location:update path.
    const assignedBookings = new Set<string>();

    // Subscribe to a booking's live channel — only if the user is a party to it.
    socket.on('booking:join', async (bookingId: string) => {
      if (typeof bookingId !== 'string' || bookingId.length === 0) return;
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { customerId: true, technicianId: true },
      });
      if (!booking) {
        logger.warn({ userId, bookingId }, 'Denied booking:join (booking not found)');
        return;
      }
      const isAssignedTech = !!booking.technicianId && booking.technicianId === (await techProfileId(socket, userId));
      if (booking.customerId !== userId && !isAssignedTech) {
        logger.warn({ userId, bookingId }, 'Denied booking:join (not a party to booking)');
        return;
      }
      if (isAssignedTech) assignedBookings.add(bookingId);
      socket.join(`booking:${bookingId}`);
    });

    socket.on('booking:leave', (bookingId: string) => {
      if (typeof bookingId === 'string') {
        socket.leave(`booking:${bookingId}`);
        assignedBookings.delete(bookingId);
      }
    });

    // Only the ASSIGNED technician may publish location for a booking.
    socket.on('location:update', async (payload: unknown) => {
      if (!isLocationPayload(payload)) {
        logger.warn({ userId }, 'Discarded malformed location:update');
        return;
      }
      // Fast path: assignment already verified at join time (no DB hit).
      let allowed = assignedBookings.has(payload.bookingId);
      if (!allowed) {
        const booking = await prisma.booking.findUnique({
          where: { id: payload.bookingId },
          select: { technicianId: true },
        });
        allowed = !!booking?.technicianId && booking.technicianId === (await techProfileId(socket, userId));
        if (allowed) assignedBookings.add(payload.bookingId);
      }
      if (!allowed) {
        logger.warn({ userId, bookingId: payload.bookingId }, 'Denied location:update (not assigned technician)');
        return;
      }
      socket.to(`booking:${payload.bookingId}`).emit('location:update', {
        technicianId: userId,
        bookingId: payload.bookingId,
        lat: payload.lat,
        lng: payload.lng,
        at: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      logger.debug({ userId }, 'Socket disconnected');
    });
  });

  return io;
}
