import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { upsertAccount, setAccountInUse } from '../src/lib/server/accounts';
import { listSitesForAllAccounts, listAllKnownSites } from '../src/lib/server/google';
import { gscCacheInvalidate } from '../src/lib/server/gsc-cache';
import {
  normalizeHost,
  parseHostList,
  createSiteGroup,
  renameSiteGroup,
  deleteSiteGroup,
  setSiteGroupHosts,
  listSiteGroups,
  setActiveSiteGroup,
  activeGroupHosts,
  siteInHosts
} from '../src/lib/server/site-groups';

describe('normalizeHost / parseHostList', () => {
  it('понимает домен, адрес и sc-domain', () => {
    expect(normalizeHost('Example.com')).toBe('example.com');
    expect(normalizeHost('https://www.example.com/page?x=1')).toBe('example.com');
    expect(normalizeHost('sc-domain:shop.example.com')).toBe('shop.example.com');
    expect(normalizeHost('http://example.com:8080/')).toBe('example.com');
    expect(normalizeHost('привет')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
  });

  it('кириллический домен приводит к той же форме, что и Google', () => {
    expect(normalizeHost('пример.рф')).toBe(normalizeHost('sc-domain:пример.рф'));
  });

  it('разбирает список через строки, запятые и пробелы, без повторов', () => {
    const r = parseHostList('a.com\nhttps://www.a.com/, b.ru  мусор\n\nsc-domain:c.org');
    expect(r.hosts).toEqual(['a.com', 'b.ru', 'c.org']);
    expect(r.rejected).toEqual(['мусор']);
  });
});

describe('группы сайтов', () => {
  let dir: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 'test.db'));
    gscCacheInvalidate();
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('создание, переименование, состав, удаление', () => {
    const id = createSiteGroup(db, '  Приоритет  ');
    expect(() => createSiteGroup(db, 'приоритет')).toThrow(/уже есть/);
    expect(() => createSiteGroup(db, ' ')).toThrow();
    setSiteGroupHosts(db, id, ['https://www.b.com/', 'a.com', 'a.com', 'не домен']);
    expect(listSiteGroups(db)).toEqual([{ id, name: 'Приоритет', active: false, hosts: ['a.com', 'b.com'], done: [], items: 0, fixedAt: null }]);
    renameSiteGroup(db, id, 'Топ-20');
    expect(listSiteGroups(db)[0].name).toBe('Топ-20');
    setActiveSiteGroup(db, id);
    deleteSiteGroup(db, id);
    expect(listSiteGroups(db)).toEqual([]);
    // Удалённая активная группа снимает фильтр, а не оставляет пустые отчёты.
    expect(activeGroupHosts(db)).toBeNull();
  });

  it('активной бывает только одна группа', () => {
    const a = createSiteGroup(db, 'A');
    const b = createSiteGroup(db, 'B');
    setSiteGroupHosts(db, b, ['b.com']);
    setActiveSiteGroup(db, a);
    setActiveSiteGroup(db, b);
    expect(listSiteGroups(db).filter((g) => g.active).map((g) => g.name)).toEqual(['B']);
    expect([...activeGroupHosts(db)!]).toEqual(['b.com']);
    setActiveSiteGroup(db, null);
    expect(activeGroupHosts(db)).toBeNull();
  });

  it('siteInHosts сопоставляет property обоих видов', () => {
    const hosts = new Set(['a.com']);
    expect(siteInHosts('sc-domain:a.com', hosts)).toBe(true);
    expect(siteInHosts('https://www.a.com/', hosts)).toBe(true);
    expect(siteInHosts('https://blog.a.com/', hosts)).toBe(false);
    expect(siteInHosts('не url', hosts)).toBe(false);
  });

  it('отчёты видят только сайты группы; галочки консолей действуют и при выбранной группе', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    for (const id of ['g1', 'g2']) {
      upsertAccount(db, { id, email: `${id}@x`, access_token: `t-${id}`, refresh_token: 'r', expires_at: future, scope: 's' });
    }
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      const list = auth === 'Bearer t-g1'
        ? ['sc-domain:a.com', 'https://b.com/', 'https://c.com/']
        : ['https://www.a.com/', 'https://d.com/'];
      return new Response(JSON.stringify({ siteEntry: list.map((siteUrl) => ({ siteUrl, permissionLevel: 'siteOwner' })) }), { status: 200 });
    }));

    const g = createSiteGroup(db, 'Приоритет');
    setSiteGroupHosts(db, g, ['a.com', 'd.com']);
    setActiveSiteGroup(db, g);

    const urls = async () => (await listSitesForAllAccounts(db)).sites.map((s) => s.siteUrl).sort();
    expect(await urls()).toEqual(['https://d.com/', 'https://www.a.com/', 'sc-domain:a.com']);

    // Галочки главнее группы: выключенная g2 не отдаёт даже сайты группы.
    setAccountInUse(db, 'g2', false);
    gscCacheInvalidate();
    expect(await urls()).toEqual(['sc-domain:a.com']);

    // Страница групп видит всё, без фильтров.
    expect((await listAllKnownSites(db)).sites).toHaveLength(5);

    // Без группы — все сайты отмеченных консолей.
    setActiveSiteGroup(db, null);
    expect(await urls()).toEqual(['https://b.com/', 'https://c.com/', 'sc-domain:a.com']);
  });
});
