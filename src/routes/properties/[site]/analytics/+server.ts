import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reportPeriod } from '$lib/server/report-period';
import { db } from '$lib/server/db';
import { getAccount } from '$lib/server/accounts';
import { fetchSiteQueryPages } from '$lib/server/google';
import { getBrandedTerms } from '$lib/server/branded';
import { requireAdmin } from '$lib/server/guard';
import { dropFilteredQueries, filterPatterns } from '$lib/server/filters';
import { listUrlExclusions } from '$lib/server/site-url-exclusions';
import { urlExcluded, urlMatchesMask } from '$lib/utils/url-filters';
import {
  rowToQueryPage,
  computeStriking,
  computeCannibalization,
  computeCtrBenchmark,
  splitBranded,
  aggregateByQuery
} from '$lib/server/analytics';

// One GSC query+page fetch → Striking, Cannibalization, CTR benchmark and Branded split.
export const GET: RequestHandler = async ({ params, url, locals }) => {
  requireAdmin(locals);
  const accId = url.searchParams.get('acc');
  if (!accId) throw error(400, 'acc required');
  const acc = getAccount(db(), accId);
  if (!acc) throw error(404, 'account not found');

  // Период берём из запроса: переключатель наверху страницы должен двигать и
  // эти вкладки, а не только график Overview.
  // Период — из шапки (один на все отчёты).
  const days = reportPeriod(db()).days;

  const siteUrl = params.site;
  const rows = await fetchSiteQueryPages(db(), acc, siteUrl, days);
  // Те же фильтры мусорных запросов, что на странице сайтов и в экспорте:
  // `site:` — оператор поиска, а не ключ.
  const qp = dropFilteredQueries(rows.map(rowToQueryPage), filterPatterns(db()), (r) => r.query);
  const terms = getBrandedTerms(db(), siteUrl);
  const exclusions = listUrlExclusions(db(), siteUrl);
  const mask = url.searchParams.get('urlMask') ?? '';
  const include = url.searchParams.get('urlMode') !== 'not_contains';
  if (mask.length > 2000) throw error(400, 'URL mask is too long');
  const strikingRows = qp.filter((r) => !urlExcluded(r.page, exclusions) && (!mask || (include ? urlMatchesMask(r.page, mask) : !urlMatchesMask(r.page, mask))));

  // Диапазон Striking с переключателей над таблицей: позиции 4–20 / 4–50 / все
  // и показов от 10 / 1. Без параметров — обычные 4–20 и от 10 показов.
  const posMaxRaw = Number(url.searchParams.get('posMax') ?? '20');
  const posMax = [20, 50, 0].includes(posMaxRaw) ? posMaxRaw : 20;
  const minImprRaw = Number(url.searchParams.get('minImpr') ?? '10');
  const minImpressions = [10, 1].includes(minImprRaw) ? minImprRaw : 10;
  const range = { posMin: posMax === 0 ? 1 : 4, posMax, minImpressions };

  // Потолок на один сайт выше дефолтного: за 60-480 дней в striking легко
  // набирается больше сотни запросов, и обрезать их молча — врать о картине.
  return json({
    days,
    striking: computeStriking(strikingRows, posMax === 0 ? 2000 : 1000, range),
    strikingRange: range,
    cannibalization: computeCannibalization(qp, 200),
    ctr: computeCtrBenchmark(qp, 200),
    branded: splitBranded(aggregateByQuery(qp), terms),
    brandedTerms: terms
  });
};
