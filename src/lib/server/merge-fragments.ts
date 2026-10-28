// Google Search Console считает https://a.com/page/#bonus и https://a.com/page/#faq
// разными страницами, хотя это одна страница с якорями. Склеиваем такие строки:
// клики и показы складываются, позиция — средняя с весом по показам, CTR заново.

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Адрес без якоря: всё после # отбрасывается. */
export function stripFragment(url: string): string {
  const i = url.indexOf('#');
  return i === -1 ? url : url.slice(0, i);
}

export function mergePageFragments<T extends GscRow>(rows: T[], pageIndex: number): T[] {
  if (pageIndex < 0 || !rows.some((r) => (r.keys[pageIndex] ?? '').includes('#'))) return rows;
  const out = new Map<string, T & { _posSum: number }>();
  for (const r of rows) {
    const keys = r.keys.slice();
    keys[pageIndex] = stripFragment(keys[pageIndex] ?? '');
    const k = keys.join('\u0000');
    const cur = out.get(k);
    if (!cur) {
      out.set(k, { ...r, keys, _posSum: r.position * r.impressions });
    } else {
      cur.clicks += r.clicks;
      cur.impressions += r.impressions;
      cur._posSum += r.position * r.impressions;
    }
  }
  return [...out.values()].map(({ _posSum, ...r }) => {
    const row = r as unknown as T;
    row.ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
    // Без показов позиции не взвесить — оставляем позицию первой строки.
    if (row.impressions > 0) row.position = _posSum / row.impressions;
    return row;
  });
}
