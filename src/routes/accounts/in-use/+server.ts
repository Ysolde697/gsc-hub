import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { listAccounts, setAccountInUse, setAccountsInUse } from '$lib/server/accounts';
import { requireAdmin } from '$lib/server/guard';
import { gscCacheInvalidate } from '$lib/server/gsc-cache';

/**
 * Выбор консолей для отчётов.
 *   { id, inUse }  — включить или выключить одну консоль;
 *   { ids }        — оставить включёнными ровно эти (пустой массив — ни одной).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; inUse?: unknown; ids?: unknown }
    | null;
  if (!body) throw error(400, 'нужен JSON');

  const known = new Set(listAccounts(db()).map((a) => a.id));
  if (Array.isArray(body.ids)) {
    const ids = body.ids.filter((x): x is string => typeof x === 'string' && known.has(x));
    setAccountsInUse(db(), ids);
  } else if (typeof body.id === 'string' && typeof body.inUse === 'boolean') {
    if (!known.has(body.id)) throw error(404, 'консоль не найдена');
    setAccountInUse(db(), body.id, body.inUse);
  } else {
    throw error(400, 'нужно { id, inUse } или { ids }');
  }

  // Портфель кэшируется целиком за период; после смены набора консолей
  // он должен пересчитаться. Ответы по отдельным сайтам кэшируются по аккаунту
  // и остаются верными.
  gscCacheInvalidate('portfolio:');

  return json({
    accounts: listAccounts(db()).map((a) => ({ id: a.id, inUse: a.in_use !== 0 }))
  });
};
