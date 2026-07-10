import { BookingStatus, PayoutStatus, TechnicianStatus } from '@prisma/client';
import { env } from '../../shared/env';
import type { IPayoutProvider } from '../../domain/providers/IPayoutProvider';
import { PayoutProviderFactory } from '../../infrastructure/providers/PayoutProviderFactory';
import { PaymentService } from '../payment/PaymentService';
import { PaymentProviderFactory } from '../../infrastructure/providers/PaymentProviderFactory';
import { AdminAuthFlow } from './AdminService.auth';
import { AdminPayoutFlow } from './AdminService.payout';
import {
  getAdminStats,
  listBookings,
  getBookingDetail,
  listBookingsForExport,
  listTechnicians,
  getTechnicianDetail,
  listCustomerBookings,
  listCustomers,
  listPayouts,
} from './AdminService.reads';
import { verifyTechnician, rejectTechnician, suspendTechnician, reinstateTechnician } from './AdminService.technicianModeration';
import { setCustomerBlocked } from './AdminService.customerModeration';

/**
 * Admin dashboard operations: auth/session, read/detail-view queries,
 * technician + customer moderation, and payout disbursement/refunds.
 *
 * The lifecycle is implemented across sibling files, composed here:
 *   AdminService.auth.ts                 — login/refresh/logout session flow
 *   AdminService.reads.ts                — read-only / detail-view queries
 *   AdminService.technicianModeration.ts — verify/reject/suspend a technician
 *   AdminService.customerModeration.ts   — block/unblock a customer
 *   AdminService.payout.ts               — payout disbursement/reconciliation + refunds
 * This class is the public entry point; it delegates every method to the
 * relevant flow so its own signature and behavior are unchanged.
 */
export class AdminService {
  private readonly authFlow: AdminAuthFlow;
  private readonly payoutFlow: AdminPayoutFlow;

  constructor(
    private readonly payoutProvider: IPayoutProvider = PayoutProviderFactory.create(),
    private readonly paymentService: PaymentService = new PaymentService(PaymentProviderFactory.create(), env().PAYMENT_PROVIDER),
  ) {
    this.authFlow = new AdminAuthFlow();
    this.payoutFlow = new AdminPayoutFlow(payoutProvider, paymentService);
  }

  async refundBookingPayment(bookingId: string, amountJod: number | string, actorId: string, ip?: string) {
    return this.payoutFlow.refundBookingPayment(bookingId, amountJod, actorId, ip);
  }

  async login(email: string, password: string, ip?: string) {
    return this.authFlow.login(email, password, ip);
  }

  async refresh(refreshToken?: string) {
    return this.authFlow.refresh(refreshToken);
  }

  async logout(refreshToken?: string): Promise<void> {
    return this.authFlow.logout(refreshToken);
  }

  async getStats() {
    return getAdminStats();
  }

  async listBookings(status?: BookingStatus, limit = 50, offset = 0) {
    return listBookings(status, limit, offset);
  }

  async getBookingDetail(id: string, actorId: string, ip?: string) {
    return getBookingDetail(id, actorId, ip);
  }

  async listBookingsForExport(status: BookingStatus | undefined, maxRows: number) {
    return listBookingsForExport(status, maxRows);
  }

  async listTechnicians(status?: TechnicianStatus, limit = 50, offset = 0, search?: string) {
    return listTechnicians(status, limit, offset, search);
  }

  async getTechnicianDetail(id: string, actorId: string, ip?: string) {
    return getTechnicianDetail(id, actorId, ip);
  }

  async verifyTechnician(id: string, actorId: string, ip?: string) {
    return verifyTechnician(id, actorId, ip);
  }

  async rejectTechnician(id: string, reason: string, actorId: string, ip?: string) {
    return rejectTechnician(id, reason, actorId, ip);
  }

  async suspendTechnician(id: string, reason: string, actorId: string, ip?: string) {
    return suspendTechnician(id, reason, actorId, ip);
  }

  async reinstateTechnician(id: string, actorId: string, ip?: string) {
    return reinstateTechnician(id, actorId, ip);
  }

  async listCustomerBookings(customerId: string, limit = 50, offset = 0) {
    return listCustomerBookings(customerId, limit, offset);
  }

  async setCustomerBlocked(id: string, blocked: boolean, actorId: string, ip?: string) {
    return setCustomerBlocked(id, blocked, actorId, ip);
  }

  async listCustomers(limit = 50, offset = 0, search?: string) {
    return listCustomers(limit, offset, search);
  }

  async listPayouts(status?: PayoutStatus, limit = 50, offset = 0) {
    return listPayouts(status, limit, offset);
  }

  async processPayout(id: string, actorId: string, ip?: string) {
    return this.payoutFlow.processPayout(id, actorId, ip);
  }

  async reconcileStuckPayouts(): Promise<number> {
    return this.payoutFlow.reconcileStuckPayouts();
  }
}
