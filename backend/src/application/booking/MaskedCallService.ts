import { BookingStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { MaskedCallProviderFactory } from '../../infrastructure/providers/MaskedCallProviderFactory';
import type { IMaskedCallProvider } from '../../domain/providers/IMaskedCallProvider';

/** Masked calling is only available once a technician is assigned and the job is
 *  actually under way — there is no one to bridge to before CONFIRMED, and no
 *  further need for a live call once the job is settled. */
const CALLABLE_STATUSES: BookingStatus[] = ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

export class MaskedCallService {
  constructor(private readonly provider: IMaskedCallProvider = MaskedCallProviderFactory.create()) {}

  /** Create (or reuse) a masked-call session for a booking, returning the proxy
   *  number the caller should dial. Only the booking's customer or assigned
   *  technician may call this; neither party's real number is ever returned. */
  async createSession(bookingId: string, requesterUserId: string): Promise<{ proxyNumber: string }> {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        customerId: true,
        customer: { select: { phone: true } },
        technicianId: true,
        technician: { select: { userId: true, user: { select: { phone: true } } } },
      },
    });
    if (!booking) throw new NotFoundError('Booking');
    if (!booking.technicianId || !booking.technician) {
      throw new ConflictError('Booking has no assigned technician yet');
    }

    const isCustomer = booking.customerId === requesterUserId;
    const isTechnician = booking.technician.userId === requesterUserId;
    if (!isCustomer && !isTechnician) throw new ForbiddenError();

    if (!CALLABLE_STATUSES.includes(booking.status)) {
      throw new ConflictError('Masked calling is only available for an active booking');
    }

    const result = await this.provider.createOrReuseSession({
      bookingId,
      customerPhone: booking.customer.phone,
      technicianPhone: booking.technician.user.phone,
    });
    return { proxyNumber: result.proxyNumber };
  }
}
