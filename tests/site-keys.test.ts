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
  it('свои даты: с–по, порядок и границы', () => {
    expect(parsePeriod('2026-10-01_2026-10-15', now)).toMatchObject({ key: '2026-10-01_2026-10-15', startDate: '2026-10-01', endDate: '2026-10-15', days: 15 });
    expect(parsePeriod('2026-10-15_2026-10-01', now)).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-15' });
    expect(parsePeriod('2026-10-20_2026-12-31', now)).toMatchObject({ endDate: '2026-10-29', days: 10 });
    expect(parsePeriod('2026-13-45_2026-10-01', now).key).toBe('28');
  });
});
