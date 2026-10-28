import { describe, it, expect } from 'vitest';
import { mergePageFragments, stripFragment } from '../src/lib/server/merge-fragments';

const row = (q: string, page: string, clicks: number, impressions: number, position: number) => ({
  keys: [q, page], clicks, impressions, ctr: impressions ? clicks / impressions : 0, position
});

describe('склейка страниц с якорями', () => {
  it('отбрасывает якорь', () => {
    expect(stripFragment('https://a.app/game/#Bonuses')).toBe('https://a.app/game/');
    expect(stripFragment('https://a.app/game/')).toBe('https://a.app/game/');
  });

  it('один ключ на трёх якорях — одна строка с суммой и взвешенной позицией', () => {
    const out = mergePageFragments(
      [
        row('cricket road game download', 'https://cricket-road.app/game/#Bonuses', 2, 100, 5),
        row('cricket road game download', 'https://cricket-road.app/game/#Features', 1, 50, 8),
        row('cricket road game download', 'https://cricket-road.app/game/#What_Is', 1, 50, 11),
        row('другой ключ', 'https://cricket-road.app/game/', 3, 30, 4)
      ],
      1
    );
    expect(out).toHaveLength(2);
    const m = out.find((r) => r.keys[0] === 'cricket road game download')!;
    expect(m.keys[1]).toBe('https://cricket-road.app/game/');
    expect(m.clicks).toBe(4);
    expect(m.impressions).toBe(200);
    expect(m.ctr).toBeCloseTo(0.02);
    expect(m.position).toBeCloseTo((5 * 100 + 8 * 50 + 11 * 50) / 200);
  });

  it('страница с якорем и без — тоже склеиваются', () => {
    const out = mergePageFragments([row('k', 'https://a.co/p', 1, 10, 3), row('k', 'https://a.co/p#x', 1, 10, 5)], 1);
    expect(out).toEqual([{ keys: ['k', 'https://a.co/p'], clicks: 2, impressions: 20, ctr: 0.1, position: 4 }]);
  });

  it('без якорей и без колонки page строки не трогает', () => {
    const rows = [row('k', 'https://a.co/p', 1, 10, 3)];
    expect(mergePageFragments(rows, 1)).toBe(rows);
    expect(mergePageFragments(rows, -1)).toBe(rows);
  });
});
