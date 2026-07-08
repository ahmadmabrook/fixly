import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError } from '../../shared/errors';

/**
 * Read-only / detail-view queries for bookings, extracted from BookingService
 * (see that file for the full class overview). Stateless — no injected
 * dependencies — so these are plain functions rather than a composed class.
 */

export async function getBookingById(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true, payment: true },
  });
  if (!booking) throw new NotFoundError('Booking');

  // Fast path: customer owns it directly. Only look up a technician
  // profile when the requester isn't the customer.
  if (booking.customerId === userId) return booking;

  if (booking.technicianId) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (profile && booking.technicianId === profile.id) return booking;
  }

  throw new ForbiddenError();
}

export async function listBookingsForUser(userId: string, role: string, limit = 50, offset = 0) {
  // Customers see their own bookings; technicians see ones assigned to them.
  // For technicians, resolve the profile id once and filter by the indexed
  // `technicianId` column (the `{ technician: { userId } }` relation filter
  // can't use @@index([technicianId, status]) and forces a join subquery —
  // costly on the 15s tech-dashboard poll).
  let where: Prisma.BookingWhereInput;
  if (role === 'CUSTOMER') {
    where = { customerId: userId };
  } else {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return { items: [], total: 0 };
    where = { technicianId: profile.id };
  }

  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: { service: true },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

export async function listAdditionalWorkItems(bookingId: string, userId: string) {
  await getBookingById(bookingId, userId); // authorize as a party
  return prisma.additionalWorkItem.findMany({ where: { bookingId }, orderBy: { createdAt: 'asc' } });
}
