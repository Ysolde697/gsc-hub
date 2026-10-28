import type { Db } from './db';
import { siteHostname } from '$lib/utils/url-filters';

// Группы сайтов: именованные списки доменов. Одну группу можно выбрать
// фильтром в шапке — тогда все общие отчёты и MCP видят только её сайты.

export interface SiteGroup {
  id: number;
  name: string;
  active: boolean;
  hosts: string[];
  /** Сайты группы, отмеченные «Пройден». */
  done: string[];
  /** Сколько ключей отобрано в группу в Striking Distance. */
  items: number;
  /** Группа зафиксирована: ключи больше не меняются. */
  fixedAt: number | null;
}

export const GROUP_NAME_MAX = 60;
export const GROUP_HOSTS_MAX = 5000;

/**
 * Домен из того, что вставили: `example.com`, `https://www.example.com/page`,
 * `sc-domain:example.com`. Возвращает null для строк, где домена нет.
 */
export function normalizeHost(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!raw.startsWith('sc-domain:') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const host = siteHostname(raw);
    // Хотя бы одна точка и без пробелов: «привет» доменом не считаем.
    return host.includes('.') && !/\s/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** Разбор вставленного списка: по строке, запятой или пробелу на домен. */
export function parseHostList(text: string): { hosts: string[]; rejected: string[] } {
  const hosts = new Set<string>();
  const rejected: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) continue;
    const host = normalizeHost(part);
    if (host) hosts.add(host);
    else rejected.push(part);
  }
  return { hosts: [...hosts], rejected };
}

export function listSiteGroups(db: Db): SiteGroup[] {
  const groups = db
    .prepare(
      `SELECT g.id, g.name, g.active, g.fixed_at,
              (SELECT COUNT(*) FROM site_group_items i WHERE i.group_id = g.id) AS items
         FROM site_groups g ORDER BY g.created_at DESC, g.id DESC`
    )
    .all() as { id: number; name: string; active: number; fixed_at: number | null; items: number }[];
  const rows = db.prepare('SELECT group_id, host, done_at FROM site_group_hosts ORDER BY host').all() as {
    group_id: number;
    host: string;
    done_at: number | null;
  }[];
  const hosts = new Map<number, string[]>();
  const done = new Map<number, string[]>();
  for (const r of rows) {
    hosts.set(r.group_id, [...(hosts.get(r.group_id) ?? []), r.host]);
    if (r.done_at) done.set(r.group_id, [...(done.get(r.group_id) ?? []), r.host]);
  }
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    active: g.active === 1,
    hosts: hosts.get(g.id) ?? [],
    done: done.get(g.id) ?? [],
    items: g.items,
    fixedAt: g.fixed_at
  }));
}

function cleanName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new Error('Нужно название группы');
  if (n.length > GROUP_NAME_MAX) throw new Error(`Название длиннее ${GROUP_NAME_MAX} символов`);
  return n;
}

function nameTaken(db: Db, name: string, exceptId?: number): boolean {
  // NOCASE в SQLite знает только латиницу, а группы называют по-русски.
  const key = name.toLocaleLowerCase('ru');
  const rows = db.prepare('SELECT id, name FROM site_groups').all() as { id: number; name: string }[];
  return rows.some((r) => r.id !== exceptId && r.name.toLocaleLowerCase('ru') === key);
}

export function createSiteGroup(db: Db, name: string): number {
  const n = cleanName(name);
  if (nameTaken(db, n)) throw new Error(`Группа «${n}» уже есть`);
  const info = db
    .prepare('INSERT INTO site_groups (name, active, created_at) VALUES (?, 0, ?)')
    .run(n, Date.now());
  return Number(info.lastInsertRowid);
}

export function renameSiteGroup(db: Db, id: number, name: string): void {
  const n = cleanName(name);
  if (nameTaken(db, n, id)) throw new Error(`Группа «${n}» уже есть`);
  db.prepare('UPDATE site_groups SET name = ? WHERE id = ?').run(n, id);
}

export function deleteSiteGroup(db: Db, id: number): void {
  db.prepare('DELETE FROM site_groups WHERE id = ?').run(id);
}

/** Заменить состав группы целиком. */
export function setSiteGroupHosts(db: Db, id: number, hosts: string[]): void {
  const clean = [...new Set(hosts.map(normalizeHost).filter((h): h is string => !!h))];
  if (clean.length > GROUP_HOSTS_MAX) throw new Error(`В группе больше ${GROUP_HOSTS_MAX} сайтов`);
  const now = Date.now();
  const keep = new Set(clean);
  const existing = db.prepare('SELECT host FROM site_group_hosts WHERE group_id = ?').all(id) as { host: string }[];
  const del = db.prepare('DELETE FROM site_group_hosts WHERE group_id = ? AND host = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO site_group_hosts (group_id, host, added_at) VALUES (?, ?, ?)');
  db.transaction(() => {
    // Убираем только снятые: у оставшихся сохраняется отметка «Пройден».
    for (const e of existing) if (!keep.has(e.host)) del.run(id, e.host);
    for (const h of clean) ins.run(id, h, now);
  })();
}

/** Отметка «Пройден» у сайта группы. */
export function setHostDone(db: Db, id: number, host: string, done: boolean): void {
  const h = normalizeHost(host);
  if (!h) throw new Error('Не похоже на домен');
  const info = db
    .prepare('UPDATE site_group_hosts SET done_at = ? WHERE group_id = ? AND host = ?')
    .run(done ? Date.now() : null, id, h);
  if (info.changes === 0) throw new Error('Этого сайта нет в группе');
}

/** Выбранная в шапке группа целиком, или null. */
export function activeSiteGroup(db: Db): SiteGroup | null {
  return listSiteGroups(db).find((g) => g.active) ?? null;
}

export function getSiteGroup(db: Db, id: number): SiteGroup | undefined {
  return listSiteGroups(db).find((g) => g.id === id);
}

/** Выбрать группу фильтром (null — все сайты). */
export function setActiveSiteGroup(db: Db, id: number | null): void {
  db.transaction(() => {
    db.prepare('UPDATE site_groups SET active = 0 WHERE active = 1').run();
    if (id !== null) db.prepare('UPDATE site_groups SET active = 1 WHERE id = ?').run(id);
  })();
}

/**
 * Домены выбранной группы, или null, когда группа не выбрана и отчёты
 * показывают все сайты.
 */
export function activeGroupHosts(db: Db): Set<string> | null {
  const g = db.prepare('SELECT id FROM site_groups WHERE active = 1 LIMIT 1').get() as
    | { id: number }
    | undefined;
  if (!g) return null;
  const rows = db.prepare('SELECT host FROM site_group_hosts WHERE group_id = ?').all(g.id) as {
    host: string;
  }[];
  return new Set(rows.map((r) => r.host));
}

/** Сайт property входит в набор доменов. Битый siteUrl в группу не входит. */
export function siteInHosts(siteUrl: string, hosts: Set<string>): boolean {
  try {
    return hosts.has(siteHostname(siteUrl));
  } catch {
    return false;
  }
}
