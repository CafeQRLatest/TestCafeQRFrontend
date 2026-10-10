import { formatTzDate, getBranchParts } from '../timezoneUtils';

describe('branch time handling', () => {
  test('UTC LocalDateTime string without Z is shown in the branch timezone', () => {
    // 19:00 UTC on 10 Oct is 00:30 on 11 Oct in India
    expect(formatTzDate('2026-10-10T19:00:00', 'Asia/Kolkata', { format: 'datetime', locale: 'en-GB' }))
      .toMatch(/11 Oct 2026/);
  });

  test('date-only values never shift to another day', () => {
    expect(formatTzDate('2026-10-01', 'Asia/Dubai', { format: 'date', locale: 'en-GB' })).toMatch(/01 Oct 2026/);
    expect(formatTzDate('2026-10-01', 'Africa/Johannesburg', { format: 'date', locale: 'en-GB' })).toMatch(/01 Oct 2026/);
  });

  test('getBranchParts returns branch wall-clock parts', () => {
    expect(getBranchParts('2026-10-10T19:00:00', 'Asia/Kolkata')).toEqual({ year: 2026, month: 10, day: 11, hour: 0 });
    expect(getBranchParts('2026-10-10T19:00:00Z', 'Asia/Dubai')).toEqual({ year: 2026, month: 10, day: 10, hour: 23 });
    expect(getBranchParts('not a date', 'Asia/Dubai')).toBeNull();
  });
});
