import { describe, it, expect } from 'vitest';
import { buildSlotDays } from './BookingDetail';

describe('buildSlotDays', () => {
  it('returns 7 days, none today or in the past', () => {
    const now = new Date('2026-06-29T10:00:00'); // local
    const days = buildSlotDays(now);
    expect(days).toHaveLength(7);
    const todayStr = '2026-06-29';
    for (const d of days) {
      expect(d.dateStr > todayStr).toBe(true);
    }
    // First selectable day is tomorrow.
    expect(days[0].dateStr).toBe('2026-06-30');
    expect(days[6].dateStr).toBe('2026-07-06');
  });

  it('rolls over a month boundary correctly', () => {
    const now = new Date('2026-01-29T10:00:00');
    const days = buildSlotDays(now);
    expect(days[0].dateStr).toBe('2026-01-30');
    expect(days[1].dateStr).toBe('2026-01-31');
    expect(days[2].dateStr).toBe('2026-02-01'); // crosses into Feb
    expect(days[2].label).toBe('1/2');
  });

  it('rolls over a year boundary correctly', () => {
    const now = new Date('2026-12-29T10:00:00');
    const days = buildSlotDays(now);
    expect(days[0].dateStr).toBe('2026-12-30');
    expect(days[1].dateStr).toBe('2026-12-31');
    expect(days[2].dateStr).toBe('2027-01-01'); // crosses into next year
  });

  it('handles a leap-day February correctly (2028 is a leap year)', () => {
    const now = new Date('2028-02-27T10:00:00');
    const days = buildSlotDays(now);
    expect(days[0].dateStr).toBe('2028-02-28');
    expect(days[1].dateStr).toBe('2028-02-29'); // leap day exists
    expect(days[2].dateStr).toBe('2028-03-01');
  });

  it('zero-pads single-digit months and days in dateStr', () => {
    const now = new Date('2026-03-04T10:00:00');
    const days = buildSlotDays(now);
    expect(days[0].dateStr).toBe('2026-03-05');
    expect(days[0].dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('round-trips local time: the stored ISO-naive string parses back to the same wall-clock slot', () => {
    const now = new Date('2026-06-29T10:00:00');
    const day = buildSlotDays(now)[0]; // 2026-06-30
    const iso = `${day.dateStr}T08:00:00`;
    const parsed = new Date(iso); // parsed as LOCAL time
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(5); // June (0-indexed)
    expect(parsed.getDate()).toBe(30);
    expect(parsed.getHours()).toBe(8);
  });
});
