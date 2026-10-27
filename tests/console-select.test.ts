import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDb, type Db } from '../src/lib/server/db';
import {
  upsertAccount,
  listAccounts,
  listReportAccounts,
  markRevoked,
  setAccountInUse,
  setAccountsInUse
} from '../src/lib/server/accounts';
import { listSitesForAllAccounts } from '../src/lib/server/google';
import { gscCacheInvalidate } from '../src/lib/server/gsc-cache';

const future = () => Math.floor(Date.now() / 1000) + 3600;
const add = (db: Db, id: string) =>
  upsertAccount(db, { id, email: `${id}@x`, access_token: `t-${id}`, refresh_token: 'r', expires_at: future(), scope: 's' });

describe('выбор консолей', () => {
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

  it('новая консоль включена по умолчанию', () => {
    add(db, 'c1');
    expect(listAccounts(db)[0].in_use).toBe(1);
    expect(listReportAccounts(db).map((a) => a.id)).toEqual(['c1']);
  });

  it('выключенная и отозванная консоли не попадают в отчёты', () => {
    add(db, 'c1');
    add(db, 'c2');
    add(db, 'c3');
    setAccountInUse(db, 'c2', false);
    markRevoked(db, 'c3', 'gone');
    expect(listReportAccounts(db).map((a) => a.id)).toEqual(['c1']);
    // Страница Accounts по-прежнему видит все три.
    expect(listAccounts(db)).toHaveLength(3);
  });

  it('setAccountsInUse оставляет ровно указанные', () => {
    for (const id of ['c1', 'c2', 'c3', 'c4']) add(db, id);
    setAccountsInUse(db, ['c2', 'c4']);
    expect(listReportAccounts(db).map((a) => a.id)).toEqual(['c2', 'c4']);
    setAccountsInUse(db, []);
    expect(listReportAccounts(db)).toEqual([]);
    setAccountsInUse(db, ['c1', 'c2', 'c3', 'c4']);
    expect(listReportAccounts(db)).toHaveLength(4);
  });

  it('переподключение консоли не сбрасывает галочку', () => {
    add(db, 'c1');
    setAccountInUse(db, 'c1', false);
    add(db, 'c1');
    expect(listAccounts(db)[0].in_use).toBe(0);
  });

  it('общий список сайтов не ходит в Google за выключенной консолью', async () => {
    add(db, 'c1');
    add(db, 'c2');
    setAccountInUse(db, 'c2', false);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      const site = auth === 'Bearer t-c1' ? 'https://one.com/' : 'https://two.com/';
      return new Response(JSON.stringify({ siteEntry: [{ siteUrl: site, permissionLevel: 'siteOwner' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sites } = await listSitesForAllAccounts(db);
    expect(sites.map((s) => s.siteUrl)).toEqual(['https://one.com/']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('миграция добавляет колонку в старую базу и включает все консоли', () => {
    const path = join(dir, 'old.db');
    const raw = new Database(path);
    raw.exec(`CREATE TABLE google_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, label TEXT, access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL, expires_at INTEGER NOT NULL, scope TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', last_error TEXT, added_at INTEGER NOT NULL)`);
    raw.prepare(`INSERT INTO google_accounts (id, email, access_token, refresh_token, expires_at, scope, added_at)
      VALUES ('old', 'old@x', 't', 'r', 0, 's', 1)`).run();
    raw.close();
    const migrated = openDb(path);
    expect(listReportAccounts(migrated).map((a) => a.id)).toEqual(['old']);
    migrated.close();
  });
});
