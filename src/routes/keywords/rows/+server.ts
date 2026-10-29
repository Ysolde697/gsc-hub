import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { getAccount } from '$lib/server/accounts';
import { parsePeriod, siteKeysForPeriod } from '$lib/server/site-keys';

/** Все ключи одного сайта за период: ?site=&acc=&p=today|yesterday|7|28|90|180|480 */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const site = url.searchParams.get('site');
  const acc = getAccount(db(), url.searchParams.get('acc') ?? '');
  if (!site) throw error(400, 'site required');
  if (!acc) throw error(404, 'консоль не найдена');
  const p = parsePeriod(url.searchParams.get('p'));
  try {
    return json({ rows: await siteKeysForPeriod(db(), acc, site, p), period: p });
  } catch (e) {
    throw error(502, (e as Error).message.slice(0, 200));
  }
};
