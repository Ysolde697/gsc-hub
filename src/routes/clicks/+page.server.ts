import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { parsePeriod, sitesForPeriod } from '$lib/server/site-keys';
import { clicksForRange, lastSeen, normHost } from '$lib/server/button-clicks';
import { siteHostname } from '$lib/utils/url-filters';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals);
  const period = parsePeriod(url.searchParams.get('p'));
  const clicks = clicksForRange(db(), period.startDate, period.endDate);
  // Клики из Google за тот же период — по домену (у домена бывает 2 property: берём бо́льшую).
  const { sites, errors } = await sitesForPeriod(db(), period);
  const gsc: Record<string, number> = {};
  const gscImpr: Record<string, number> = {};
  for (const s of sites) {
    try {
      const h = normHost(siteHostname(s.siteUrl));
      gsc[h] = Math.max(gsc[h] ?? 0, s.clicks);
      gscImpr[h] = Math.max(gscImpr[h] ?? 0, s.impressions);
    } catch {
      /* битый адрес */
    }
  }
  return { period, clicks, gsc, gscImpr, lastSeen: lastSeen(db()), errors, origin: url.origin };
};
