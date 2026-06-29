import { describe, it, expect } from 'vitest';
import { extractBookingId } from './extractBookingId';

const UUID_A = '11111111-2222-4333-8444-555555555555';
const UUID_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('extractBookingId', () => {
  it('extracts a UUID embedded in free-text Arabic message', () => {
    const msgs = [{ body: `رقم الحجز هو ${UUID_A} شكراً` }];
    expect(extractBookingId(msgs)).toBe(UUID_A);
  });

  it('extracts a bare UUID', () => {
    expect(extractBookingId([{ body: UUID_B }])).toBe(UUID_B);
  });

  it('is case-insensitive', () => {
    const upper = UUID_B.toUpperCase();
    expect(extractBookingId([{ body: upper }])).toBe(upper);
  });

  it('returns null when no UUID is present', () => {
    expect(extractBookingId([{ body: 'لا يوجد رقم هنا، فقط نص عادي 12345' }])).toBeNull();
  });

  it('returns null for empty / missing message lists', () => {
    expect(extractBookingId([])).toBeNull();
    expect(extractBookingId(null)).toBeNull();
    expect(extractBookingId(undefined)).toBeNull();
  });

  it('skips messages with non-string / missing bodies without throwing', () => {
    const msgs = [
      { body: null },
      { body: undefined },
      {},
      { body: `الحجز ${UUID_A}` },
    ] as Array<{ body?: string | null }>;
    expect(extractBookingId(msgs)).toBe(UUID_A);
  });

  it('returns the FIRST UUID when several appear across messages (in order)', () => {
    const msgs = [
      { body: 'مرحباً، لا يوجد رقم' },
      { body: `الحجز الأول ${UUID_A}` },
      { body: `الحجز الثاني ${UUID_B}` },
    ];
    expect(extractBookingId(msgs)).toBe(UUID_A);
  });

  it('returns the FIRST UUID when several appear in the SAME message', () => {
    const msgs = [{ body: `${UUID_A} ثم ${UUID_B}` }];
    expect(extractBookingId(msgs)).toBe(UUID_A);
  });

  it('does not match a UUID-like substring glued to other word chars', () => {
    // Leading hex chars make the run longer than 8 in the first group, so the
    // \b-anchored 8-4-4-4-12 shape no longer matches at that position.
    const glued = `xref${UUID_A}`;
    expect(extractBookingId([{ body: glued }])).toBeNull();
  });
});
