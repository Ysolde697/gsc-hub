import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { getSiteGroup } from '$lib/server/site-groups';
import { listGroupItems, groupItemsCsv } from '$lib/server/group-items';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireAdmin(locals);
  const g = getSiteGroup(db(), Number(params.id));
  if (!g) throw error(404, 'группа не найдена');
  const name = `${g.name.replace(/[^\p{L}\p{N}._-]+/gu, '_')}.csv`;
  return new Response(groupItemsCsv(g.name, listGroupItems(db(), g.id)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="group.csv"; filename*=UTF-8''${encodeURIComponent(name)}`
    }
  });
};
