// Оценка частотности ключа по Search Console ваших сайтов.
// Если сайт стоит на первой странице (позиция ≤ 10), Google засчитывает показ
// почти при каждом поиске — его показы ≈ число запросов. Ниже первой страницы
// показы видят только те, кто долистал, — это лишь нижняя граница.

export type VolumeEstimate = { value: number; kind: 'top10' | 'min'; host: string; position: number };

export function estimateVolume(
  rows: { host: string; impressions: number; position: number }[],
  days = 28
): VolumeEstimate | null {
  if (!rows.length) return null;
  const perMonth = (n: number) => Math.round((n * 30) / days);
  const top = rows.filter((r) => r.position <= 10).sort((a, b) => b.impressions - a.impressions)[0];
  if (top) return { value: perMonth(top.impressions), kind: 'top10', host: top.host, position: top.position };
  const best = [...rows].sort((a, b) => b.impressions - a.impressions)[0];
  return { value: perMonth(best.impressions), kind: 'min', host: best.host, position: best.position };
}
