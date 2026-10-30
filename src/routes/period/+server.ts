import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { parsePeriod } from '$lib/server/site-keys';
import { currentUserId, setUserPeriodKey } from '$lib/server/user-selection';

/** Выбрать период в шапке: { p }. */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const body = (await request.json().catch(() => null)) as { p?: unknown } | null;
  const uid = currentUserId();
  if (!uid || typeof body?.p !== 'string') throw error(400, 'нужно { p }');
  const p = parsePeriod(body.p);
  setUserPeriodKey(db(), uid, p.key);
  return json({ period: p });
};
