import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { upsertAccount, setAccountInUse } from '../src/lib/server/accounts';
import { searchKeywordAcrossSites } from '../src/lib/server/google';
import { gscCacheInvalidate } from '../src/lib/server/gsc-cache';

describe('поиск ключа по всем сайтам', () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 't.db'));
    gscCacheInvalidate();
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('спрашивает Google с фильтром по ключу, видит выключенные консоли, склеивает домен', async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    for (const id of ['k1', 'k2']) upsertAccount(db, { id, email: `${id}@x`, access_token: `t-${id}`, refresh_token: 'r', expires_at: future, scope: 's' });
    setAccountInUse(db, 'k2', false);
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (url.endsWith('/sites')) {
        const list = auth === 'Bearer t-k1' ? ['sc-domain:a.com', 'https://www.a.com/'] : ['https://b.com/'];
        return new Response(JSON.stringify({ siteEntry: list.map((siteUrl) => ({ siteUrl, permissionLevel: 'siteOwner' })) }));
      }
      bodies.push(JSON.parse(String(init?.body)));
      const site = decodeURIComponent(url.split('/sites/')[1].split('/')[0]);
      const rows = site === 'https://b.com/'
        ? [{ keys: ['cricket road game', 'https://b.com/game/'], clicks: 1, impressions: 50, ctr: 0.02, position: 3 }]
        : [{ keys: ['cricket road game', 'https://a.com/'], clicks: 0, impressions: site.startsWith('sc-') ? 90 : 40, ctr: 0, position: 8 }];
      return new Response(JSON.stringify({ rows }));
    }));

    const res = await searchKeywordAcrossSites(db, 'cricket road');
    expect(res.sites).toBe(3);
    expect(res.hits.map((h) => [h.host, h.position, h.impressions])).toEqual([['b.com', 3, 50], ['a.com', 8, 90]]);
    expect(bodies[0]).toMatchObject({ dimensions: ['query', 'page'], dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'contains', expression: 'cricket road' }] }] });
  });
});
