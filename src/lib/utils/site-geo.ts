// ГЕО сайта для колонки «Мои другие сайты»: сайты из разных стран по одному
// ключу друг другу не конкуренты. Страны сайта — главная по показам и все,
// где у него не меньше `share` показов.

export function siteCountries(rows: { country: string; impressions: number }[], share = 0.2): string[] {
  const total = rows.reduce((s, r) => s + r.impressions, 0);
  if (total <= 0) return [];
  const sorted = [...rows].filter((r) => r.country).sort((a, b) => b.impressions - a.impressions);
  return sorted.filter((r, i) => i === 0 || r.impressions / total >= share).map((r) => r.country.toLowerCase());
}

/** Одна страна хотя бы общая. ГЕО неизвестно (нет данных) — не отсеиваем. */
export function sameGeo(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return true;
  return a.some((c) => b.includes(c));
}
