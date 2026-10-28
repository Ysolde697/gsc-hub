import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { gscCacheInvalidate } from '$lib/server/gsc-cache';
import {
  listSiteGroups,
  createSiteGroup,
  setSiteGroupHosts,
  setActiveSiteGroup,
  setHostDone,
  getSiteGroup,
  normalizeHost
} from '$lib/server/site-groups';
import { addGroupItem, removeGroupItem, itemMarks, todayGroupName, type NewItem } from '$lib/server/group-items';

const summaries = () =>
  listSiteGroups(db()).map((g) => ({
    id: g.id,
    name: g.name,
    active: g.active,
    fixedAt: g.fixedAt,
    items: g.items,
    hosts: g.hosts,
    done: g.done
  }));

/** Группы и пометки для колонки «В группу» в Striking Distance. ?site= — по одному сайту. */
export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals);
  const site = url.searchParams.get('site') || undefined;
  return json({ groups: summaries(), marks: itemMarks(db(), site), today: todayGroupName() });
};

/**
 *   { action: 'add',    groupId, item }               — ключ в группу
 *   { action: 'remove', groupId, page, query }        — убрать ключ
 *   { action: 'done',   groupId, host, done }         — сайт пройден / не пройден
 *   { action: 'today',  site }                        — новая группа на сегодня с этим сайтом, выбрать её
 *   { action: 'host',   groupId, site, on }           — добавить сайт в группу / убрать (страница Sites)
 *   { action: 'create', name? }                       — новая группа (по умолчанию сегодняшняя дата)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) throw error(400, 'нужен JSON');
  try {
    if (body.action === 'today') {
      const host = normalizeHost(String(body.site ?? ''));
      const name = todayGroupName();
      const existing = listSiteGroups(db()).find((g) => g.name === name);
      const id = existing?.id ?? createSiteGroup(db(), name);
      const hosts = getSiteGroup(db(), id)!.hosts;
      if (host && !hosts.includes(host)) setSiteGroupHosts(db(), id, [...hosts, host]);
      setActiveSiteGroup(db(), id);
      gscCacheInvalidate('portfolio:');
      return json({ ok: true, id, groups: summaries() });
    }
    if (body.action === 'create') {
      const name = typeof body.name === 'string' && body.name.trim() ? body.name : todayGroupName();
      const id = createSiteGroup(db(), name);
      return json({ ok: true, id, groups: summaries() });
    }
    const groupId = Number(body.groupId);
    if (!Number.isInteger(groupId) || groupId < 1) throw new Error('Не выбрана группа');
    if (body.action === 'add') addGroupItem(db(), groupId, (body.item ?? {}) as NewItem);
    else if (body.action === 'remove') removeGroupItem(db(), groupId, String(body.page ?? ''), String(body.query ?? ''));
    else if (body.action === 'host') {
      const g = getSiteGroup(db(), groupId);
      const host = normalizeHost(String(body.site ?? ''));
      if (!g || !host) throw new Error('Нет группы или сайта');
      const next = body.on === true ? [...g.hosts, host] : g.hosts.filter((h) => h !== host);
      setSiteGroupHosts(db(), groupId, next);
      gscCacheInvalidate('portfolio:');
    } else if (body.action === 'done') setHostDone(db(), groupId, String(body.host ?? ''), body.done === true);
    else throw new Error('неизвестное действие');
    return json({ ok: true, groups: summaries() });
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
