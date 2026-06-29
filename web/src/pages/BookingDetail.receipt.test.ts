import { describe, it, expect } from 'vitest';
import { escapeHtml, generateReceiptHtml, type FullBooking } from './BookingDetail';
import type { AdditionalWorkItem } from '../lib/api';

function makeBooking(overrides: Partial<FullBooking> = {}): FullBooking {
  return {
    id: 'abcdef12-3456-7890-aaaa-bbbbbbbbbbbb',
    status: 'COMPLETED',
    scheduledAt: '2026-06-30T08:00:00.000Z',
    totalJod: 50,
    service: {
      id: 'svc1',
      nameAr: 'كهرباء',
      nameEn: 'Electric',
      priceJod: 50,
      durationMin: 45,
    } as FullBooking['service'],
    technicianId: null,
    payment: { status: 'CAPTURED', capturedAmountJod: 50 },
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escapes all HTML-special characters', () => {
    expect(escapeHtml(`<script>alert('x')</script>`)).toBe(
      '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;',
    );
    expect(escapeHtml('a & b "q"')).toBe('a &amp; b &quot;q&quot;');
  });

  it('handles null / undefined / numbers safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('generateReceiptHtml — XSS hardening', () => {
  it('escapes a malicious additional-work description (stored-XSS sink)', () => {
    const extras: AdditionalWorkItem[] = [
      {
        id: 'x1',
        description: `<img src=x onerror=alert(document.cookie)>`,
        amountJod: 10,
        status: 'APPROVED',
        createdAt: '2026-06-29T00:00:00.000Z',
      },
    ];
    const html = generateReceiptHtml(makeBooking(), extras);
    // The raw payload must NOT appear; the escaped form must.
    expect(html).not.toContain('<img src=x onerror=');
    expect(html).toContain('&lt;img src=x onerror=alert(document.cookie)&gt;');
  });

  it('escapes a malicious service name', () => {
    const b = makeBooking({
      service: {
        id: 's',
        nameAr: `</td></tr></table><script>evil()</script>`,
        nameEn: 'e',
        priceJod: 1,
        durationMin: 1,
      } as FullBooking['service'],
    });
    const html = generateReceiptHtml(b, []);
    expect(html).not.toContain('<script>evil()</script>');
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
  });

  it('escapes payment status and booking id', () => {
    const b = makeBooking({
      id: '<b>00</b>cdef12-rest',
      payment: { status: '"><svg onload=alert(1)>', capturedAmountJod: 1 },
    });
    const html = generateReceiptHtml(b, []);
    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).not.toContain('<b>00</b>');
  });

  it('renders legitimate values unchanged in escaped output', () => {
    const html = generateReceiptHtml(makeBooking(), []);
    expect(html).toContain('كهرباء');
    expect(html).toContain('50 دينار');
    expect(html).toContain('CAPTURED');
  });
});
