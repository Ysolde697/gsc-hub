import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reportPeriod } from '$lib/server/report-period';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { getAccount } from '$lib/server/accounts';
import { searchAnalyticsQuery, type DimensionFilter } from '$lib/server/google';
import { addCalendarDays } from '$lib/server/gsc-calendar';

/**
 * Сайт (или один ключ на странице) по дням за период из шапки: средняя позиция,
 * клики, показы — для графика на «Ключах сайтов». ?site=&acc=[&q=&page=]
 * День без показов приходит с position: null — на графике это разрыв.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const site = url.searchParams.get('site');
  const acc = getAccount(db(), url.searchParams.get('acc') ?? '');
  if (!site) throw error(400, 'site required');
  if (!acc) throw error(404, 'консоль не найдена');
  const p = reportPeriod(db());
  if (p.days < 2) return json({ points: [], period: p });
  const filters: DimensionFilter[] = [];
  const q = url.searchParams.get('q');
  const page = url.searchParams.get('page');
  if (q) filters.push({ dimension: 'query', operator: 'equals', expression: q });
  if (page) filters.push({ dimension: 'page', operator: 'equals', expression: page });
  try {
    const rows = await searchAnalyticsQuery(db(), acc, site, {
      startDate: p.startDate,
      endDate: p.endDate,
      dimensions: ['date'],
      rowLimit: 500,
      ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {})
    });
    const byDay = new Map(rows.map((r) => [r.keys[0], r]));
    const points: { date: string; clicks: number; impressions: number; position: number | null }[] = [];
    for (let d = p.startDate; d <= p.endDate; d = addCalendarDays(d, 1)) {
      const r = byDay.get(d);
      points.push({ date: d, clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, position: r && r.impressions > 0 ? r.position : null });
    }
    return json({ points, period: p });
  } catch (e) {
    throw error(502, (e as Error).message.slice(0, 200));
  }
};
