import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import {
  daysUntil, domainCandidates, listDomainDates, parseRdapDates, refreshDomainDates, resetRdapBootstrap, setManualDates
} from '../src/lib/server/domain-dates';

const BOOT = { services: [[['com'], ['https://rdap.verisign.com/com/v1/']], [['uk'], ['https://rdap.nominet.uk/uk/']]] };
const rdap = (reg: string, exp?: string) => ({
  events: [{ eventAction: 'registration', eventDate: `${reg}T10:00:00Z` }, ...(exp ? [{ eventAction: 'expiration', eventDate: `${exp}T10:00:00Z` }] : [])]
});

describe('domain dates', () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 'test.db'));
    resetRdapBootstrap();
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('reads registration and expiration from an RDAP answer', () => {
    expect(parseRdapDates(rdap('2026-10-15', '2027-10-15'))).toEqual({ registered: '2026-10-15', expires: '2027-10-15' });
    expect(parseRdapDates(rdap('2026-10-08'))).toEqual({ registered: '2026-10-08', expires: null });
    expect(parseRdapDates(null)).toEqual({ registered: null, expires: null });
  });

  it('tries the domain, then its parents', () => {
    expect(domainCandidates('www.blog.site.co.uk')).toEqual(['blog.site.co.uk', 'site.co.uk', 'co.uk']);
    expect(domainCandidates('fc-27.com')).toEqual(['fc-27.com']);
  });

  it('asks the zone registry, notes zones without RDAP, keeps manual dates above registry ones', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('iana.org')) return new Response(JSON.stringify(BOOT));
      if (url.endsWith('/domain/fc-27.com')) return new Response(JSON.stringify(rdap('2026-10-15', '2027-10-15')));
      if (url.endsWith('/domain/blog.site.co.uk')) return new Response('', { status: 404 });
      if (url.endsWith('/domain/site.co.uk')) return new Response(JSON.stringify(rdap('2026-10-08', '2027-10-08')));
      return new Response('', { status: 500 });
    }));
    await refreshDomainDates(db, ['fc-27.com', 'blog.site.co.uk', 'fccoins.de']);
    const m = listDomainDates(db);
    expect(m.get('fc-27.com')).toMatchObject({ registered: '2026-10-15', expires: '2027-10-15', error: null, expiresManual: false });
    expect(m.get('blog.site.co.uk')).toMatchObject({ registered: '2026-10-08', expires: '2027-10-08' });
    expect(m.get('fccoins.de')).toMatchObject({ registered: null, expires: null, error: 'no-rdap' });

    setManualDates(db, 'fccoins.de', '2026-10-08', '2027-10-08');
    setManualDates(db, 'fc-27.com', '', '2028-01-01');
    const m2 = listDomainDates(db);
    expect(m2.get('fccoins.de')).toMatchObject({ registered: '2026-10-08', expires: '2027-10-08', registeredManual: true, expiresManual: true });
    expect(m2.get('fc-27.com')).toMatchObject({ registered: '2026-10-15', expires: '2028-01-01', registeredManual: false, expiresManual: true });
  });

  it('keeps known dates when the registry is down for a while', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('iana.org') ? new Response(JSON.stringify(BOOT)) : new Response(JSON.stringify(rdap('2026-10-15', '2027-10-15')))
    );
    vi.stubGlobal('fetch', fetchMock);
    await refreshDomainDates(db, ['fc-27.com']);
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('iana.org') ? new Response(JSON.stringify(BOOT)) : new Response('busy', { status: 503 })
    ));
    await refreshDomainDates(db, ['fc-27.com'], { force: true });
    expect(listDomainDates(db).get('fc-27.com')).toMatchObject({ expires: '2027-10-15', error: 'rdap 503' });
  });

  it('does not ask again within a week', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('iana.org') ? new Response(JSON.stringify(BOOT)) : new Response(JSON.stringify(rdap('2026-10-15', '2027-10-15')))
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await refreshDomainDates(db, ['fc-27.com'])).toBe(1);
    expect(await refreshDomainDates(db, ['fc-27.com'])).toBe(0);
  });

  it('counts calendar days left in Germany', () => {
    const now = Date.parse('2026-11-02T22:30:00Z'); // 23:30 в Германии, 2 ноября
    expect(daysUntil('2026-11-03', now)).toBe(1);
    expect(daysUntil('2026-11-02', now)).toBe(0);
    expect(daysUntil('2026-10-31', now)).toBe(-2);
  });
});
