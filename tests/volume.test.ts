import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { setConfigValue } from '../src/lib/server/config';
import { estimateVolume } from '../src/lib/utils/volume-estimate';
import { fetchVolumes, cachedVolumes, volumeEligible } from '../src/lib/server/dataforseo';
import { googleAdsLocationCode } from '../src/lib/utils/country';

describe('estimateVolume', () => {
  it('топ-10: показы лучшего сайта на первой странице, на 30 дней', () => {
    expect(estimateVolume([
      { host: 'a.com', impressions: 280, position: 4.2 },
      { host: 'b.com', impressions: 900, position: 14 }
    ])).toEqual({ value: 300, kind: 'top10', host: 'a.com', position: 4.2 });
  });
  it('все ниже 10-го места — нижняя граница', () => {
    expect(estimateVolume([{ host: 'a.com', impressions: 28, position: 31 }])).toMatchObject({ value: 30, kind: 'min' });
    expect(estimateVolume([])).toBeNull();
  });
});

describe('googleAdsLocationCode', () => {
  it('2000 + ISO numeric', () => {
    expect(googleAdsLocationCode('arg')).toBe(2032);
    expect(googleAdsLocationCode('TUR')).toBe(2792);
    expect(googleAdsLocationCode('usa')).toBe(2840);
    expect(googleAdsLocationCode('zzz')).toBeNull();
  });
});

describe('fetchVolumes', () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    db = openDb(join(dir, 'test.db'));
    setConfigValue(db, 'DATAFORSEO_LOGIN', 'l');
    setConfigValue(db, 'DATAFORSEO_PASSWORD', 'p');
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('спрашивает только новые ключи и сохраняет ответ', async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({
        status_code: 20000, cost: 0.05,
        tasks: [{ status_code: 20000, result: body[0].keywords.map((k: string) => ({ keyword: k, search_volume: k === '1win apk' ? 1900 : null })) }]
      }), { status: 200 });
    });
    const r1 = await fetchVolumes(db, ['1win APK', 'codigo 1win argentina', 'https://t.1xbet.com/en intitle: x'], 2032, f as unknown as typeof fetch);
    expect(r1).toEqual({ requested: 2, skipped: 1, cost: 0.05 });
    const m = cachedVolumes(db, ['1win apk', 'codigo 1win argentina'], 2032);
    expect(m.get('1win apk')?.volume).toBe(1900);
    expect(m.get('codigo 1win argentina')?.volume).toBeNull();
    // второй раз — без запроса
    const r2 = await fetchVolumes(db, ['1win apk'], 2032, f as unknown as typeof fetch);
    expect(r2.requested).toBe(0);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('неверный пароль — понятная ошибка', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status_code: 40100, status_message: 'You are not authorized' }), { status: 401 }));
    await expect(fetchVolumes(db, ['x'], 2032, f as unknown as typeof fetch)).rejects.toThrow('неверный логин или пароль');
  });

  it('volumeEligible', () => {
    expect(volumeEligible('1win apk')).toBe(true);
    expect(volumeEligible('a b c d e f g h i j k')).toBe(false);
  });
});
