import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { listAllKnownSites } from '$lib/server/google';
import { gscCacheInvalidate } from '$lib/server/gsc-cache';
import {
  listSiteGroups,
  createSiteGroup,
  renameSiteGroup,
  deleteSiteGroup,
  setSiteGroupHosts,
  getSiteGroup,
  parseHostList
} from '$lib/server/site-groups';
import { siteHostname } from '$lib/utils/url-filters';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  // Все сайты всех консолей, без фильтров: выбирать в группу можно любой.
  const { sites, errors } = await listAllKnownSites(db());
  const byHost = new Map<string, { host: string; accounts: string[] }>();
  for (const s of sites) {
    let host: string;
    try {
      host = siteHostname(s.siteUrl);
    } catch {
      continue;
    }
    const row = byHost.get(host) ?? { host, accounts: [] };
    const who = s.accountLabel || s.accountEmail;
    if (!row.accounts.includes(who)) row.accounts.push(who);
    byHost.set(host, row);
  }
  return {
    groups: listSiteGroups(db()),
    knownSites: [...byHost.values()].sort((a, b) => a.host.localeCompare(b.host)),
    siteErrors: errors.map((e) => ({ account: e.accountEmail, reason: e.reason }))
  };
};

function groupId(form: FormData): number | null {
  const n = Number(form.get('id'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function changed() {
  // Портфель кэшируется целиком; состав группы мог поменяться.
  gscCacheInvalidate('portfolio:');
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireAdmin(locals);
    const form = await request.formData();
    try {
      const id = createSiteGroup(db(), String(form.get('name') ?? ''));
      return { created: id };
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
  rename: async ({ request, locals }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const id = groupId(form);
    if (!id) return fail(400, { error: 'Нет группы' });
    try {
      renameSiteGroup(db(), id, String(form.get('name') ?? ''));
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
  },
  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const id = groupId(await request.formData());
    if (!id) return fail(400, { error: 'Нет группы' });
    deleteSiteGroup(db(), id);
    changed();
  },
  // Состав целиком: отмеченные галочками домены плюс вставленный текстом список.
  hosts: async ({ request, locals }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const id = groupId(form);
    if (!id || !getSiteGroup(db(), id)) return fail(400, { error: 'Нет группы' });
    const picked = form.getAll('host').map(String);
    const { hosts: pasted, rejected } = parseHostList(String(form.get('paste') ?? ''));
    try {
      setSiteGroupHosts(db(), id, [...picked, ...pasted]);
    } catch (e) {
      return fail(400, { error: (e as Error).message });
    }
    changed();
    return { saved: id, rejected };
  }
};
