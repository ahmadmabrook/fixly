import { Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import { reviewsSubmittedTotal } from '../../shared/metrics';

interface SubmitReviewInput {
  bookingId: string;
  reviewerId: string;
  rating: number;
  comment?: string;
  photos?: string[];
}

/**
 * Reviews are only created from COMPLETED bookings, so every review is
 * inherently "verified" (the reviewer actually received/performed the service).
 * Customer→technician reviews drive the technician's public rating aggregate.
 */
export class ReviewService {
  async submitReview(input: SubmitReviewInput) {
    if (input.rating < 1 || input.rating > 5) throw new ValidationError('Rating must be between 1 and 5');

    const booking = await prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { technician: { select: { id: true, userId: true } } },
    });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.status !== 'COMPLETED') throw new ValidationError('Only completed bookings can be reviewed');

    // Resolve the reviewee as the OTHER party to the booking.
    const isCustomer = booking.customerId === input.reviewerId;
    const isTechnician = !!booking.technician && booking.technician.userId === input.reviewerId;
    if (!isCustomer && !isTechnician) throw new ForbiddenError('Not a party to this booking');
    if (!booking.technician) throw new ValidationError('Booking has no assigned technician');

    const revieweeId = isCustomer ? booking.technician.userId : booking.customerId;

    const existing = await prisma.review.findUnique({
      where: { bookingId_reviewerId: { bookingId: input.bookingId, reviewerId: input.reviewerId } },
    });
    if (existing) throw new ConflictError('You have already reviewed this booking');

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          bookingId: input.bookingId,
          reviewerId: input.reviewerId,
          revieweeId,
          rating: input.rating,
          comment: input.comment?.trim() || null,
          photos: input.photos ?? [],
        },
      });

      // Recompute the technician's public aggregate when a customer rates them.
      if (isCustomer) {
        const agg = await tx.review.aggregate({
          where: { revieweeId },
          _avg: { rating: true },
          _count: { rating: true },
        });
        await tx.technicianProfile.update({
          where: { id: booking.technician!.id },
          data: {
            rating: new Prisma.Decimal((agg._avg.rating ?? 0).toFixed(2)),
            totalReviews: agg._count.rating,
          },
        });
      }

      return created;
    });
    // Count only AFTER the review actually commits (no over-count on rollback).
    reviewsSubmittedTotal.inc({ direction: isCustomer ? 'customer_to_tech' : 'tech_to_customer' });
    return review;
  }

  /** Recent reviews across the platform for the public landing page: rating ≥ 4
   *  with a non-empty comment. (Every review here originates from a COMPLETED
   *  booking, so it is inherently genuine.) Only the reviewer's first name is
   *  exposed. */
  async recentReviews(limit = 6) {
    const items = await prisma.review.findMany({
      where: { rating: { gte: 4 }, comment: { not: null } },
      include: { reviewer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      // First name only — never the full identity on a public surface.
      reviewerName: (r.reviewer.name ?? 'عميل').split(' ')[0],
    }));
  }

  /** Public, verified-only reviews for a technician profile + rating summary. */
  async getTechnicianReviews(technicianProfileId: string, limit = 20, offset = 0) {
    const profile = await prisma.technicianProfile.findUnique({
      where: { id: technicianProfileId },
      select: { userId: true, rating: true, totalReviews: true },
    });
    if (!profile) throw new NotFoundError('Technician');

    const [items, total] = await prisma.$transaction([
      prisma.review.findMany({
        where: { revieweeId: profile.userId },
        include: { reviewer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.review.count({ where: { revieweeId: profile.userId } }),
    ]);

    return {
      summary: { rating: profile.rating, totalReviews: profile.totalReviews },
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        photos: r.photos,
        reviewerName: r.reviewer.name,
        createdAt: r.createdAt,
      })),
      total,
    };
  }
}
