import { it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { ensureCounterKey, counterKeyOk, listCounterKeys, revokeCounterKey } from '../src/lib/server/config';

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

it('новый ключ не ломает сайты со старым; отзыв — только явный', () => {
  const k1 = ensureCounterKey(db);
  expect(counterKeyOk(db, k1, 'fut-coins.nl')).toBe(true);
  const k2 = ensureCounterKey(db, true);
  expect(k2).not.toBe(k1);
  expect(counterKeyOk(db, k1, 'fut-coins.nl')).toBe(true);
  expect(counterKeyOk(db, k2, 'fccoins.fr')).toBe(true);
  expect(counterKeyOk(db, 'чужой', 'x.com')).toBe(false);

  const keys = listCounterKeys(db);
  expect(keys.find((k) => k.current)?.hosts).toEqual(['fccoins.fr']);
  const old = keys.find((k) => !k.current)!;
  expect(old.hosts).toEqual(['fut-coins.nl']);

  expect(revokeCounterKey(db, keys.find((k) => k.current)!.hash)).toBe(false); // текущий нельзя
  expect(revokeCounterKey(db, old.hash)).toBe(true);
  expect(counterKeyOk(db, k1, 'fut-coins.nl')).toBe(false);
  expect(counterKeyOk(db, k2, 'fccoins.fr')).toBe(true);
});
