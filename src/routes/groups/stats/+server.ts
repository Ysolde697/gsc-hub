import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { getSiteGroup } from '$lib/server/site-groups';
import { hostTotalsForPeriod, parsePeriod } from '$lib/server/site-keys';

/** Показы, клики, CTR и позиция сайтов группы за период: ?g=&p=today|yesterday|7|28|… */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const g = getSiteGroup(db(), Number(url.searchParams.get('g')));
  if (!g) throw error(404, 'нет группы');
  const period = parsePeriod(url.searchParams.get('p'));
  return json({ period, byHost: await hostTotalsForPeriod(db(), g.hosts, period) });
};
