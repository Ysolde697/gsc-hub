import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { gscCacheInvalidate } from '$lib/server/gsc-cache';
import { getSiteGroup, setActiveSiteGroup } from '$lib/server/site-groups';

/** { id: number | null } — выбрать группу фильтром или вернуть все сайты. */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!body || !('id' in body)) throw error(400, 'нужно { id }');
  const id = body.id;
  if (id === null) setActiveSiteGroup(db(), null);
  else if (typeof id === 'number' && getSiteGroup(db(), id)) setActiveSiteGroup(db(), id);
  else throw error(404, 'группа не найдена');
  gscCacheInvalidate('portfolio:');
  return json({ ok: true });
};
