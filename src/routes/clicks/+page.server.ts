import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { parsePeriod, sitesForPeriod } from '$lib/server/site-keys';
import { clicksForRange, lastSeen, normHost, timeForRange } from '$lib/server/button-clicks';
import { siteHostname } from '$lib/utils/url-filters';
import { activeGroupHosts } from '$lib/server/site-groups';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals);
  const period = parsePeriod(url.searchParams.get('p'));
  const clicks = clicksForRange(db(), period.startDate, period.endDate);
  // Клики из Google за тот же период — по домену (у домена бывает 2 property: берём бо́льшую).
  const { sites, errors } = await sitesForPeriod(db(), period);
  // Только сайты консолей, выбранных в шапке (и группы, если она выбрана).
  const group = activeGroupHosts(db());
  const hosts = new Set<string>();
  const gsc: Record<string, number> = {};
  const gscImpr: Record<string, number> = {};
  for (const s of sites) {
    try {
      const h = normHost(siteHostname(s.siteUrl));
      if (group && !group.has(h)) continue;
      hosts.add(h);
      gsc[h] = Math.max(gsc[h] ?? 0, s.clicks);
      gscImpr[h] = Math.max(gscImpr[h] ?? 0, s.impressions);
    } catch {
      /* битый адрес */
    }
  }
  const mine = (h: string) => hosts.has(h);
  const seen = Object.fromEntries(Object.entries(lastSeen(db())).filter(([h]) => mine(h)));
  return {
    period,
    hosts: [...hosts].sort(),
    clicks: clicks.filter((r) => mine(r.host)),
    time: timeForRange(db(), period.startDate, period.endDate).filter((t) => mine(t.host)),
    gsc,
    gscImpr, lastSeen: seen, errors, origin: url.origin };
};
