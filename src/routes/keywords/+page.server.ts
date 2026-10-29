import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { parsePeriod, sitesForPeriod } from '$lib/server/site-keys';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals);
  const period = parsePeriod(url.searchParams.get('p'));
  const { sites, errors } = await sitesForPeriod(db(), period);
  return { period, sites, errors };
};
