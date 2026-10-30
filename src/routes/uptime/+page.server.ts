import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { listSitesForAllAccounts } from '$lib/server/google';
import { siteHostname } from '$lib/utils/url-filters';
import { setConfigValue } from '$lib/server/config';
import { acceptCurrent, baseHost, checkHost, history, intervalHours, INTERVALS, listChecks, runDue } from '$lib/server/uptime';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  // Сайты консолей, выбранных в шапке (и группы, если выбрана).
  const { sites } = await listSitesForAllAccounts(db());
  const hosts = new Set<string>();
  for (const s of sites) {
    try {
      hosts.add(baseHost(siteHostname(s.siteUrl)));
    } catch {
      /* битый адрес */
    }
  }
  const checks = listChecks(db()).filter((c) => hosts.has(c.host));
  const hist: Record<string, ReturnType<typeof history>> = {};
  for (const h of hosts) hist[h] = history(db(), h, 20);
  return { hosts: [...hosts].sort(), checks, history: hist, interval: intervalHours(db()), intervals: [...INTERVALS] };
};

export const actions: Actions = {
  checkAll: async ({ locals }) => {
    requireAdmin(locals);
    const { sites } = await listSitesForAllAccounts(db());
    const hosts = [...new Set(sites.map((s) => { try { return baseHost(siteHostname(s.siteUrl)); } catch { return ''; } }).filter(Boolean))];
    const n = await runDue(db(), { force: true, hosts });
    return { checked: n };
  },
  checkOne: async ({ locals, request }) => {
    requireAdmin(locals);
    const host = baseHost(String((await request.formData()).get('host') ?? ''));
    if (!/^[a-z0-9.-]+$/.test(host)) return fail(400, { error: 'Не похоже на домен' });
    await checkHost(db(), host);
    return { checked: 1 };
  },
  accept: async ({ locals, request }) => {
    requireAdmin(locals);
    const host = baseHost(String((await request.formData()).get('host') ?? ''));
    acceptCurrent(db(), host);
    await checkHost(db(), host);
    return { accepted: host };
  },
  interval: async ({ locals, request }) => {
    requireAdmin(locals);
    const h = Number((await request.formData()).get('h'));
    if (!(INTERVALS as readonly number[]).includes(h)) return fail(400, { error: 'Неверная частота' });
    setConfigValue(db(), 'UPTIME_INTERVAL_H', String(h));
    return { saved: true };
  }
};
