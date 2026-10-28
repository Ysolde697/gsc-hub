import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { searchKeywordAcrossSites } from '$lib/server/google';
import { linksByQuery } from '$lib/server/group-items';
import { foldQuery } from '$lib/utils/fold-query';

/** ?q=ключ&mode=contains|equals&days=28 → строки по всем сайтам + ссылки из групп. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) throw error(400, 'Введите хотя бы 2 символа');
  if (q.length > 200) throw error(400, 'Слишком длинный ключ');
  const mode = url.searchParams.get('mode') === 'equals' ? 'equals' : 'contains';
  const days = [7, 28, 90, 180].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 28;
  const res = await searchKeywordAcrossSites(db(), q, mode, days);
  const links = linksByQuery(db());
  const rows = res.hits.slice(0, 2000).map((h) => {
    const l = (links.get(foldQuery(h.query)) ?? []).filter((x) => x.host === h.host);
    return { ...h, links: l.reduce((a, x) => a + x.qty, 0), linkGroups: [...new Set(l.map((x) => x.groupName))] };
  });
  return json({ q, mode, days, rows, total: res.hits.length, sites: res.sites, errors: res.errors, noAccess: res.noAccess, errorList: res.errorList });
};
