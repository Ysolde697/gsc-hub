import { describe, it, expect } from 'vitest';
import { parsePeriod } from '../src/lib/server/site-keys';

// 29.10.2026, 10:00 по Берлину.
const now = Date.parse('2026-10-29T09:00:00Z');

describe('parsePeriod', () => {
  it('сегодня и вчера — по Германии, один день', () => {
    expect(parsePeriod('today', now)).toMatchObject({ key: 'today', startDate: '2026-10-29', endDate: '2026-10-29', days: 1 });
    expect(parsePeriod('yesterday', now)).toMatchObject({ startDate: '2026-10-28', endDate: '2026-10-28', days: 1, pending: false });
  });
  it('N дней — завершённые дни; мусор — 28', () => {
    expect(parsePeriod('7', now)).toMatchObject({ key: '7', days: 7 });
    expect(parsePeriod('abc', now)).toMatchObject({ key: '28', days: 28 });
    expect(parsePeriod(null, now).key).toBe('28');
  });
});
