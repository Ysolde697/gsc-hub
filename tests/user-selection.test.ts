import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { upsertAccount, listReportAccounts, setAccountsInUse, setAccountInUse, listAccounts } from '../src/lib/server/accounts';
import { createSiteGroup, setActiveSiteGroup, setSiteGroupHosts, activeGroupHosts, listSiteGroups } from '../src/lib/server/site-groups';
import { als } from '../src/lib/server/request-context';
import { selectionKey } from '../src/lib/server/user-selection';

const future = () => Math.floor(Date.now() / 1000) + 3600;
const as = <T>(userId: string, fn: () => T) => als.run({ userId }, fn);

describe('выбор в шапке — свой у каждого пользователя', () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 'test.db'));
    for (const id of ['c1', 'c2', 'c3']) upsertAccount(db, { id, email: `${id}@x`, access_token: 't', refresh_token: 'r', expires_at: future(), scope: 's' });
    setAccountsInUse(db, ['c1']); // общий выбор (до разделения): работник работал в c1
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('владелец переключает консоли — у работника остаётся его консоль', () => {
    const ids = () => listReportAccounts(db).map((a) => a.id);
    expect(as('worker', ids)).toEqual(['c1']);
    as('owner', () => setAccountsInUse(db, ['c2', 'c3']));
    expect(as('owner', ids)).toEqual(['c2', 'c3']);
    expect(as('worker', ids)).toEqual(['c1']);
    as('worker', () => setAccountInUse(db, 'c3', true));
    expect(as('worker', ids)).toEqual(['c1', 'c3']);
    expect(as('owner', ids)).toEqual(['c2', 'c3']);
    // страница Accounts показывает галочки того, кто смотрит
    expect(as('owner', () => listAccounts(db).map((a) => a.in_use))).toEqual([0, 1, 1]);
    expect(as('owner', () => selectionKey(db))).not.toBe(as('worker', () => selectionKey(db)));
  });

  it('группа-фильтр тоже своя', () => {
    const g1 = createSiteGroup(db, 'A');
    const g2 = createSiteGroup(db, 'B');
    setSiteGroupHosts(db, g1, ['a.com']);
    setSiteGroupHosts(db, g2, ['b.com']);
    as('worker', () => setActiveSiteGroup(db, g1));
    as('owner', () => setActiveSiteGroup(db, g2));
    expect(as('worker', () => [...activeGroupHosts(db)!])).toEqual(['a.com']);
    expect(as('owner', () => [...activeGroupHosts(db)!])).toEqual(['b.com']);
    as('owner', () => setActiveSiteGroup(db, null));
    expect(as('owner', () => activeGroupHosts(db))).toBeNull();
    expect(as('worker', () => listSiteGroups(db).find((g) => g.active)?.name)).toBe('A');
  });
});
