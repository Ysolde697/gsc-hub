// Страница «Ключи сайтов»: все сайты отмеченных консолей с итогами за период,
// у каждого — все ключи. Период: сегодня / вчера (по Германии, свежие данные)
// или последние N завершённых дней.
import type { Db } from './db';
import { listAccounts, listReportAccounts, type AccountRow } from './accounts';
import { listAllKnownSites, listSitesForAccount, searchAnalyticsQuery, type SiteRow } from './google';
import { siteHostname } from '$lib/utils/url-filters';
import { addCalendarDays, completedDayRange, gscToday, localToday, gscDayStartsAtLocal } from './gsc-calendar';
import { mapSettledLimit } from './concurrency';
import { rowToQueryPage, type QueryPageRow } from './analytics';
import { dropFilteredQueries, filterPatterns } from './filters';

export const PERIODS = ['today', 'yesterday', '7', '28', '90', '180', '480'] as const;
export type PeriodKey = (typeof PERIODS)[number];

export interface Period {
  key: PeriodKey;
  startDate: string;
  endDate: string;
  /** Сколько дней в периоде — для пересчёта частотности на месяц. */
  days: number;
  /** Google ещё не начал этот день (его сутки — по Калифорнии). */
  pending: boolean;
  startsAt: string | null;
}

export function parsePeriod(raw: string | null, now: number = Date.now()): Period {
  const key = (PERIODS as readonly string[]).includes(raw ?? '') ? (raw as PeriodKey) : '28';
  if (key === 'today' || key === 'yesterday') {
    const d = key === 'today' ? localToday(now) : addCalendarDays(localToday(now), -1);
    return { key, startDate: d, endDate: d, days: 1, pending: gscToday(now) < d, startsAt: gscDayStartsAtLocal(d, now) };
  }
  const days = Number(key);
  const { startDate, endDate } = completedDayRange(days, now);
  return { key, startDate, endDate, days, pending: false, startsAt: null };
}

export interface SiteTotalsRow {
  siteUrl: string;
  accountId: string;
  accountEmail: string;
  accountLabel: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  error?: string;
}

/** Все сайты отмеченных консолей (без фильтра по группе) с итогами за период. */
export async function sitesForPeriod(db: Db, p: Period): Promise<{ sites: SiteTotalsRow[]; errors: { account: string; reason: string }[] }> {
  const accounts = listReportAccounts(db);
  const errors: { account: string; reason: string }[] = [];
  const pairs: { acc: AccountRow; site: SiteRow }[] = [];
  const lists = await Promise.allSettled(accounts.map((a) => listSitesForAccount(db, a)));
  lists.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const s of r.value) if (s.permissionLevel !== 'siteUnverifiedUser') pairs.push({ acc: accounts[i], site: s });
    } else errors.push({ account: accounts[i].email, reason: (r.reason as Error).message.slice(0, 200) });
  });
  const res = await mapSettledLimit(pairs, ({ acc, site }) =>
    searchAnalyticsQuery(db, acc, site.siteUrl, { startDate: p.startDate, endDate: p.endDate, dimensions: ['date'] })
  );
  const sites = pairs.map(({ site }, i): SiteTotalsRow => {
    const base = { siteUrl: site.siteUrl, accountId: site.accountId, accountEmail: site.accountEmail, accountLabel: site.accountLabel };
    const r = res[i];
    if (r.status !== 'fulfilled') return { ...base, clicks: 0, impressions: 0, ctr: 0, position: null, error: (r.reason as Error).message.slice(0, 120) };
    let clicks = 0, impressions = 0, posSum = 0;
    for (const x of r.value) {
      clicks += x.clicks;
      impressions += x.impressions;
      posSum += x.position * x.impressions;
    }
    return { ...base, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? posSum / impressions : null };
  });
  return { sites, errors };
}

/** Все ключи сайта за период (ключ + страница), без мусорных запросов. */
export async function siteKeysForPeriod(db: Db, acc: AccountRow, siteUrl: string, p: Period): Promise<QueryPageRow[]> {
  const rows = await searchAnalyticsQuery(db, acc, siteUrl, {
    startDate: p.startDate,
    endDate: p.endDate,
    dimensions: ['query', 'page'],
    rowLimit: 25000
  });
  return dropFilteredQueries(rows.map(rowToQueryPage), filterPatterns(db), (r) => r.query);
}

/**
 * Итоги за период по доменам — из всех консолей, без галочек и группы
 * (страница группы). У домена может быть несколько property: берём ту, где
 * показов больше.
 */
export async function hostTotalsForPeriod(
  db: Db,
  hosts: string[],
  p: Period
): Promise<Record<string, { clicks: number; impressions: number; ctr: number; position: number | null }>> {
  const want = new Set(hosts);
  const { sites } = await listAllKnownSites(db);
  const accounts = new Map(listAccounts(db).map((a) => [a.id, a]));
  const pairs: { acc: AccountRow; site: SiteRow; host: string }[] = [];
  for (const s of sites) {
    if (s.permissionLevel === 'siteUnverifiedUser') continue;
    let host: string;
    try {
      host = siteHostname(s.siteUrl);
    } catch {
      continue;
    }
    const acc = accounts.get(s.accountId);
    if (want.has(host) && acc) pairs.push({ acc, site: s, host });
  }
  const res = await mapSettledLimit(pairs, ({ acc, site }) =>
    searchAnalyticsQuery(db, acc, site.siteUrl, { startDate: p.startDate, endDate: p.endDate, dimensions: ['date'] })
  );
  const out: Record<string, { clicks: number; impressions: number; ctr: number; position: number | null }> = {};
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    let clicks = 0, impressions = 0, posSum = 0;
    for (const x of r.value) {
      clicks += x.clicks;
      impressions += x.impressions;
      posSum += x.position * x.impressions;
    }
    const h = pairs[i].host;
    if (!out[h] || impressions > out[h].impressions)
      out[h] = { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? posSum / impressions : null };
  });
  return out;
}
