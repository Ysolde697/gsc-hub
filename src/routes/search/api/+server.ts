import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { searchKeywordAcrossSites, mergeCountries } from '$lib/server/google';
import { linksByQuery } from '$lib/server/group-items';
import { foldQuery } from '$lib/utils/fold-query';
import { classifyIntent } from '$lib/utils/intent';

const LIMIT = 3000;

/**
 * Поиск ключей по всем сайтам.
 *   q        — ключ или часть (пусто + all=1 — все ключи)
 *   mode     — contains | equals
 *   days     — 7 | 28 | 90 | 180
 *   country  — код страны (rus, col…) или пусто — все страны вместе
 *   byCountry=1 — не складывать страны, показать строку на каждую
 *   posMin, posMax, minImpr — числа
 *   intent   — conv | brand | any
 *   site     — домен
 *   multi=1  — только ключи, которые есть на 2+ ваших сайтах
 *   nolinks=1 — только ключи без ссылок в группах
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const p = url.searchParams;
  const q = (p.get('q') ?? '').trim();
  const all = p.get('all') === '1';
  if (!all && q.length < 2) throw error(400, 'Введите хотя бы 2 символа или нажмите «Все ключи»');
  if (q.length > 200) throw error(400, 'Слишком длинный ключ');
  const mode = p.get('mode') === 'equals' ? 'equals' : 'contains';
  const days = [7, 28, 90, 180].includes(Number(p.get('days'))) ? Number(p.get('days')) : 28;

  const res = await searchKeywordAcrossSites(db(), q.length >= 2 ? q : null, mode, days);

  // Страны: список для выпадающего меню — по сумме показов.
  const byCountryImpr = new Map<string, number>();
  for (const h of res.hits) byCountryImpr.set(h.country, (byCountryImpr.get(h.country) ?? 0) + h.impressions);
  const countries = [...byCountryImpr].filter(([c]) => c).sort((a, b) => b[1] - a[1]).map(([code, impressions]) => ({ code, impressions }));

  const country = (p.get('country') ?? '').toLowerCase();
  let hits = country ? res.hits.filter((h) => h.country === country) : res.hits;
  if (p.get('byCountry') !== '1') hits = mergeCountries(hits);

  const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null);
  const posMin = num('posMin'), posMax = num('posMax'), minImpr = num('minImpr');
  const intent = p.get('intent');
  const site = (p.get('site') ?? '').toLowerCase();
  const links = linksByQuery(db());

  // Сколько ваших сайтов видны по ключу (до остальных фильтров).
  const hostsByQuery = new Map<string, Set<string>>();
  for (const h of hits) {
    const k = foldQuery(h.query);
    (hostsByQuery.get(k) ?? hostsByQuery.set(k, new Set()).get(k)!).add(h.host);
  }

  let rows = hits
    .filter((h) => (posMin === null || h.position >= posMin) && (posMax === null || h.position <= posMax))
    .filter((h) => minImpr === null || h.impressions >= minImpr)
    .filter((h) => !site || h.host === site)
    .map((h) => {
      const k = foldQuery(h.query);
      const l = (links.get(k) ?? []).filter((x) => x.host === h.host);
      return {
        ...h,
        intent: classifyIntent(h.query, h.page),
        sitesForQuery: hostsByQuery.get(k)?.size ?? 1,
        links: l.reduce((a, x) => a + x.qty, 0),
        linkGroups: [...new Set(l.map((x) => x.groupName))]
      };
    })
    .filter((h) => !intent || intent === 'any' || h.intent === intent)
    .filter((h) => p.get('multi') !== '1' || h.sitesForQuery > 1)
    .filter((h) => p.get('nolinks') !== '1' || h.links === 0);

  const total = rows.length;
  const siteList = [...new Set(res.hits.map((h) => h.host))].sort();
  rows = rows.sort((a, b) => b.impressions - a.impressions).slice(0, LIMIT);
  return json({
    q, mode, days, rows, total, limit: LIMIT, countries, sitesList: siteList,
    sites: res.sites, errors: res.errors, noAccess: res.noAccess, errorList: res.errorList
  });
};
