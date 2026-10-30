import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { listAllKnownSites } from '$lib/server/google';
import { siteHostname } from '$lib/utils/url-filters';
import { counterKeyOk } from '$lib/server/config';
import { allowClick, clicksToday, isBotUA, normHost, parseWorkerEvent, recordClick, recordTime } from '$lib/server/button-clicks';

// Приём событий счётчика от Cloudflare Worker ваших сайтов (без входа, но с
// секретным ключом). Считаем только ваши сайты из подключённых консолей,
// только браузеры (боты отсеиваются), с ограничением частоты.
// Ответ всегда пустой 204 — ничего не раскрываем.
const MAX_PER_SITE_DAY = 50_000;
let known: { hosts: Set<string>; at: number } | null = null;

async function knownHosts(): Promise<Set<string>> {
  if (known && Date.now() - known.at < 10 * 60_000) return known.hosts;
  const { sites } = await listAllKnownSites(db());
  const hosts = new Set<string>();
  for (const s of sites) {
    try {
      hosts.add(normHost(siteHostname(s.siteUrl)));
    } catch {
      /* битый адрес property */
    }
  }
  // Пустой список (Google не ответил) не кэшируем надолго.
  known = { hosts, at: hosts.size ? Date.now() : Date.now() - 9 * 60_000 };
  return hosts;
}

const EMPTY = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });


/** Старый браузерный счётчик (/c.js) отключён — такие запросы не считаем. */
export const GET: RequestHandler = () => EMPTY();

export const POST: RequestHandler = async ({ request }) => {
  const ua = request.headers.get('x-client-ua') ?? '';
  const ip = request.headers.get('x-client-ip') || 'worker';
  try {
    const parsed = parseWorkerEvent(await request.json());
    if (!parsed) return EMPTY();
    const host = 'click' in parsed ? parsed.click.host : parsed.time.host;
    // Любой выданный и не отозванный ключ; запоминаем, с какого сайта он пришёл.
    if (!counterKeyOk(db(), request.headers.get('x-counter-key'), host)) return EMPTY();
    if (isBotUA(ua)) return EMPTY();
    if (!(await knownHosts()).has(host)) return EMPTY();
    if ('time' in parsed) {
      if (allowClick(ip, { host, page: parsed.time.page, kind: 'view', label: 'time:' + Date.now(), target: '' })) recordTime(db(), parsed.time);
      return EMPTY();
    }
    if (!allowClick(ip, parsed.click)) return EMPTY();
    if (clicksToday(db(), host) >= MAX_PER_SITE_DAY) return EMPTY();
    recordClick(db(), parsed.click);
  } catch {
    /* счётчик не должен ломать сайт */
  }
  return EMPTY();
};
