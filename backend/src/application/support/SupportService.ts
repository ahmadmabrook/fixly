import { SupportStatus } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma';
import { NotFoundError } from '../../shared/errors';
import { createUserNotification } from '../notification/notify';
import { supportTicketsTotal } from '../../shared/metrics';

export class SupportService {
  /** Open a support ticket with its first message (from the customer). */
  async createTicket(userId: string, subject: string, body: string) {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        subject: subject.trim(),
        messages: { create: { senderRole: 'CUSTOMER', body: body.trim() } },
      },
      include: { messages: true },
    });
    supportTicketsTotal.inc();
    return ticket;
  }

  async listForUser(userId: string) {
    return prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async getForUser(id: string, userId: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket || ticket.userId !== userId) throw new NotFoundError('SupportTicket');
    return ticket;
  }

  /** Append a message from the customer; reopens a closed ticket. */
  async addCustomerMessage(id: string, userId: string, body: string) {
    return prisma.$transaction(async (tx) => {
      // Re-read inside the tx so a concurrent admin setStatus(CLOSED) isn't lost
      // by a stale reopen decision.
      const ticket = await tx.supportTicket.findUnique({ where: { id } });
      if (!ticket || ticket.userId !== userId) throw new NotFoundError('SupportTicket');
      await tx.supportMessage.create({ data: { ticketId: id, senderRole: 'CUSTOMER', body: body.trim() } });
      return tx.supportTicket.update({
        where: { id },
        data: { status: ticket.status === 'CLOSED' ? 'OPEN' : ticket.status },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }

  // ── Admin ──────────────────────────────────────────────

  async listForAdmin(status?: SupportStatus, limit = 50, offset = 0) {
    const where = status ? { status } : {};
    const [items, total] = await prisma.$transaction([
      prisma.supportTicket.findMany({
        where,
        include: { user: { select: { name: true, phone: true } }, _count: { select: { messages: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    return { items, total };
  }

  async getForAdmin(id: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { user: { select: { name: true, phone: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundError('SupportTicket');
    return ticket;
  }

  /** Admin reply; moves an OPEN ticket to IN_PROGRESS + notifies the customer. */
  async addAdminMessage(id: string, body: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError('SupportTicket');
    return prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({ data: { ticketId: id, senderRole: 'ADMIN', body: body.trim() } });
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      await createUserNotification(tx, {
        userId: ticket.userId,
        titleAr: 'رد جديد من الدعم',
        bodyAr: `بخصوص: ${ticket.subject}`,
      });
      return updated;
    });
  }

  async setStatus(id: string, status: SupportStatus) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundError('SupportTicket');
    return prisma.supportTicket.update({ where: { id }, data: { status } });
  }
}
