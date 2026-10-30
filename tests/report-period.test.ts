import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { als } from '../src/lib/server/request-context';
import { reportPeriod } from '../src/lib/server/report-period';
import { setUserPeriodKey } from '../src/lib/server/user-selection';

let dir: string;
let db: Db;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
  db = openDb(join(dir, 'test.db'));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

it('период из шапки — свой у пользователя и попадает в запрос', () => {
  als.run({ userId: 'owner' }, () => {
    setUserPeriodKey(db, 'owner', '2026-10-01_2026-10-10');
    const p = reportPeriod(db);
    expect(p).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-10', days: 10 });
    expect(als.getStore()?.range).toEqual({ startDate: '2026-10-01', endDate: '2026-10-10', days: 10 });
  });
  als.run({ userId: 'worker' }, () => {
    expect(reportPeriod(db).key).toBe('28');
  });
  // графикам — не меньше 7 дней
  als.run({ userId: 'owner' }, () => {
    setUserPeriodKey(db, 'owner', 'today');
    expect(reportPeriod(db, { minDays: 7 }).days).toBe(7);
  });
});
