import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { gscCacheInvalidate } from '$lib/server/gsc-cache';
import { getSiteGroup, setActiveSiteGroup } from '$lib/server/site-groups';

// «Открыть → Striking» со страницы группы: выбрать группу в шапке и перейти
// на вкладку Striking Distance сайта, где ключи добавляются кнопкой +.
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const id = Number(url.searchParams.get('g'));
  const site = url.searchParams.get('site');
  const acc = url.searchParams.get('acc');
  if (!site || !acc) throw error(400, 'нужны site и acc');
  const g = getSiteGroup(db(), id);
  if (g && !g.active) {
    setActiveSiteGroup(db(), id);
    gscCacheInvalidate('portfolio:');
  }
  throw redirect(303, `/properties/${encodeURIComponent(site)}?acc=${encodeURIComponent(acc)}&tab=keywords`);
};
