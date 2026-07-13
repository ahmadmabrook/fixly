import { BookingStatus, PayoutStatus, TechnicianStatus, UserRole, GuaranteeStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { audit } from './adminAudit';
import { NotFoundError } from '../../shared/errors';
import { omitFields } from '../../shared/sanitize';

export const PAYOUT_INCLUDE = { technician: { include: { user: true } } } as const;

/**
 * Read-only / detail-view queries for the admin dashboard, extracted from
 * AdminService (see that file for the full class overview). Stateless — no
 * injected dependencies — so these are plain functions rather than a
 * composed class.
 */

export async function getAdminStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalBookings,
    pendingBookings,
    completedBookings,
    totalTechnicians,
    verifiedTechnicians,
    activeTechnicians,
    revenueResult,
    todayRevenueResult,
    ratingResult,
    openGuarantees,
    pendingPayouts,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: BookingStatus.PENDING } }),
    prisma.booking.count({ where: { status: BookingStatus.COMPLETED } }),
    prisma.technicianProfile.count(),
    prisma.technicianProfile.count({ where: { isVerified: true } }),
    prisma.technicianProfile.count({ where: { isAvailable: true, status: TechnicianStatus.APPROVED } }),
    prisma.booking.aggregate({ _sum: { totalJod: true }, where: { status: BookingStatus.COMPLETED } }),
    prisma.booking.aggregate({
      _sum: { totalJod: true },
      where: { status: BookingStatus.COMPLETED, completedAt: { gte: startOfToday } },
    }),
    prisma.technicianProfile.aggregate({ _avg: { rating: true }, where: { totalReviews: { gt: 0 } } }),
    prisma.guaranteeTicket.count({ where: { status: { in: [GuaranteeStatus.OPEN, GuaranteeStatus.IN_REVIEW] } } }),
    prisma.payout.count({ where: { status: PayoutStatus.PENDING } }),
  ]);

  const bookingsByService = await prisma.booking.groupBy({
    by: ['serviceId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  const serviceNames = await prisma.service.findMany({
    where: { id: { in: bookingsByService.map((b) => b.serviceId) } },
    select: { id: true, nameAr: true },
  });
  const nameMap = new Map(serviceNames.map((s) => [s.id, s.nameAr]));

  const bookingsByStatusRaw = await prisma.booking.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  const statusCountMap = new Map(bookingsByStatusRaw.map((b) => [b.status, b._count.id]));

  return {
    totalBookings,
    pendingBookings,
    completedBookings,
    totalTechnicians,
    verifiedTechnicians,
    activeTechnicians,
    totalRevenueJod: Number(revenueResult._sum.totalJod ?? 0),
    todayRevenueJod: Number(todayRevenueResult._sum.totalJod ?? 0),
    avgRating: Number(ratingResult._avg.rating ?? 0),
    openGuarantees,
    pendingPayouts,
    bookingsByService: bookingsByService.map((b) => ({
      serviceId: b.serviceId,
      nameAr: nameMap.get(b.serviceId) ?? b.serviceId,
      count: b._count.id,
    })),
    // Coarse 4-bucket distribution for the dashboard's status-distribution
    // chart — mirrors the granularity of the Figma spec's donut (in
    // progress / arriving / completed / cancelled) rather than exposing
    // every fine-grained BookingStatus value.
    bookingsByStatus: {
      inProgress: statusCountMap.get(BookingStatus.IN_PROGRESS) ?? 0,
      arriving: (statusCountMap.get(BookingStatus.EN_ROUTE) ?? 0) + (statusCountMap.get(BookingStatus.ARRIVED) ?? 0),
      completed: statusCountMap.get(BookingStatus.COMPLETED) ?? 0,
      cancelled: statusCountMap.get(BookingStatus.CANCELLED) ?? 0,
    },
  };
}

export async function listBookings(status?: BookingStatus, limit = 50, offset = 0) {
  const where = status ? { status } : {};
  // Project only the fields the admin UI renders — avoids shipping full PII
  // rows (avatarUrl, internal flags) and shrinks the payload at limit=200.
  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        totalJod: true,
        createdAt: true,
        addressLat: true,
        addressLng: true,
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, nameAr: true, nameEn: true, priceJod: true } },
        technician: { select: { id: true, rating: true, user: { select: { id: true, name: true } } } },
      },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

/** Full booking detail for the admin drawer: the booking (customer, technician,
 *  service, all money fields), its status-change timeline, any additional-work
 *  items, and payment info. Reading exposes customer/technician PII, so the
 *  access is audited (mirrors getTechnicianDetail). */
export async function getBookingDetail(id: string, actorId: string, ip?: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      technician: { select: { id: true, rating: true, hourlyRateJod: true, user: { select: { id: true, name: true, phone: true } } } },
      service: { select: { id: true, nameAr: true, nameEn: true, priceJod: true, calloutFeeJod: true, durationMin: true } },
      payment: true,
    },
  });
  if (!booking) throw new NotFoundError('Booking');

  const [statusHistory, additionalWork] = await Promise.all([
    prisma.bookingStatusHistory.findMany({ where: { bookingId: id }, orderBy: { changedAt: 'asc' } }),
    prisma.additionalWorkItem.findMany({ where: { bookingId: id }, orderBy: { createdAt: 'asc' } }),
  ]);

  await audit(prisma, actorId, 'booking.view_detail', { type: 'Booking', id }, undefined, ip);

  const { payment, ...bookingFields } = booking;
  return { booking: bookingFields, statusHistory, additionalWork, payment: payment ?? null };
}

/** Same filters as listBookings, but uncapped by the list endpoint's 200-row
 *  page-size ceiling — used by the CSV export, which caps at EXPORT_MAX_ROWS
 *  instead (bounded memory, not bounded "page"). */
export async function listBookingsForExport(status: BookingStatus | undefined, maxRows: number) {
  const where = status ? { status } : {};
  return prisma.booking.findMany({
    where,
    take: maxRows,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      totalJod: true,
      discountJod: true,
      createdAt: true,
      completedAt: true,
      cancelledAt: true,
      customer: { select: { name: true, phone: true } },
      service: { select: { nameAr: true, nameEn: true } },
      technician: { select: { user: { select: { name: true } } } },
    },
  });
}

export async function listTechnicians(status?: TechnicianStatus, limit = 50, offset = 0, search?: string) {
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? { user: { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' as const } }] } }
      : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.technicianProfile.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, isVerified: true, isAvailable: true, rating: true, totalReviews: true,
        hourlyRateJod: true, createdAt: true,
        user: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.technicianProfile.count({ where }),
  ]);
  return { items, total };
}

/** Full technician detail for the admin drawer — documents, services, recent
 *  reviews. Reading exposes PII (phone, document URLs), so the access is audited. */
export async function getTechnicianDetail(id: string, actorId: string, ip?: string) {
  const profile = await prisma.technicianProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, phone: true, createdAt: true } },
      services: { select: { id: true, nameAr: true, nameEn: true } },
    },
  });
  if (!profile) throw new NotFoundError('TechnicianProfile');
  const reviews = await prisma.review.findMany({
    where: { revieweeId: profile.userId },
    include: { reviewer: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  await audit(prisma, actorId, 'technician.view_detail', { type: 'TechnicianProfile', id }, undefined, ip);
  // nationalIdEnc is write-only KYC data — never echoed back over the API, even
  // to the admin panel (readable only via direct DB/admin-tool access).
  return { ...omitFields(profile, 'nationalIdEnc'), recentReviews: reviews };
}

export async function listCustomerBookings(customerId: string, limit = 50, offset = 0) {
  const where = { customerId };
  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, totalJod: true, createdAt: true, service: { select: { nameAr: true } } },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

export async function listCustomers(limit = 50, offset = 0, search?: string) {
  const where = {
    role: UserRole.CUSTOMER,
    ...(search ? { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phone: true, isActive: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function listPayouts(status?: PayoutStatus, limit = 50, offset = 0) {
  const where = status ? { status } : {};
  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: PAYOUT_INCLUDE,
    }),
    prisma.payout.count({ where }),
  ]);
  return { items, total };
}
