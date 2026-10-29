import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { fetchQueryHosts, fetchSiteGeos } from '$lib/server/google';
import { cachedVolumes, dataForSeoConfigured, fetchVolumes, volumeKey } from '$lib/server/dataforseo';
import { estimateVolume, type VolumeEstimate } from '$lib/utils/volume-estimate';
import { googleAdsLocationCode } from '$lib/utils/country';
import { foldQuery, hostKey } from '$lib/utils/fold-query';
import { sameGeo } from '$lib/utils/site-geo';

/**
 * Частотность ключей сайта: { site, queries[], check? }.
 *  — est: оценка по Search Console ваших сайтов той же страны (бесплатно);
 *  — dfs: точное число от Google Ads через DataForSEO, если уже проверяли.
 * check: true — сначала докупить у DataForSEO ключи, которых ещё нет в базе.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const body = (await request.json().catch(() => null)) as { site?: unknown; queries?: unknown; check?: unknown; country?: unknown } | null;
  if (!body || typeof body.site !== 'string' || !Array.isArray(body.queries)) throw error(400, 'нужно { site, queries }');
  const queries = body.queries.filter((q): q is string => typeof q === 'string' && q.trim() !== '').slice(0, 5000);
  const me = hostKey(body.site);

  const geos = await fetchSiteGeos(db()).catch(() => null);
  const country = typeof body.country === 'string' && /^[a-z]{3}$/i.test(body.country) ? body.country.toLowerCase() : (geos?.get(me)?.[0] ?? null);
  const location = country ? googleAdsLocationCode(country) : null;
  const configured = dataForSeoConfigured(db());

  let checked: { requested: number; skipped: number; cost: number } | null = null;
  let checkError: string | null = null;
  if (body.check === true) {
    if (!configured) checkError = 'DataForSEO не настроен: впишите логин и пароль API в разделе «Сервисы»';
    else if (!location) checkError = 'Не знаю страну сайта — нет данных по странам в Search Console';
    else {
      try {
        checked = await fetchVolumes(db(), queries, location);
      } catch (e) {
        checkError = (e as Error).message;
      }
    }
  }

  const hosts = await fetchQueryHosts(db()).catch(() => null);
  const dfs = location ? cachedVolumes(db(), queries, location) : new Map();
  const byQuery: Record<string, { est: VolumeEstimate | null; dfs?: number | null }> = {};
  for (const q of queries) {
    const rows = (hosts?.get(foldQuery(q)) ?? []).filter((o) => sameGeo(geos?.get(me), geos?.get(o.host)));
    const d = dfs.get(volumeKey(q));
    byQuery[q] = { est: estimateVolume(rows), ...(d ? { dfs: d.volume } : {}) };
  }
  return json({ country, location, configured, byQuery, checked, checkError });
};
