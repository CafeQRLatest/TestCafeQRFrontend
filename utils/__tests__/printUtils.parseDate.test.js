import { parseDate } from '../printUtils';

describe('parseDate', () => {
  it('treats a timestamp with no zone designator as UTC', () => {
    expect(parseDate('2026-11-26T05:30:00').toISOString()).toBe('2026-11-26T05:30:00.000Z');
  });

  it('treats a timestamp with fractional seconds and no zone as UTC', () => {
    expect(parseDate('2026-11-26T05:30:00.123456').toISOString()).toBe('2026-11-26T05:30:00.123Z');
  });

  it('keeps an explicit Z timestamp as UTC', () => {
    expect(parseDate('2026-11-26T05:30:00Z').toISOString()).toBe('2026-11-26T05:30:00.000Z');
  });

  it('respects a positive offset', () => {
    expect(parseDate('2026-11-26T11:00:00+05:30').toISOString()).toBe('2026-11-26T05:30:00.000Z');
  });

  it('respects a negative offset', () => {
    expect(parseDate('2026-11-26T00:30:00-05:00').toISOString()).toBe('2026-11-26T05:30:00.000Z');
  });
});
