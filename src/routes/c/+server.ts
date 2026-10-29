import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { listAllKnownSites } from '$lib/server/google';
import { siteHostname } from '$lib/utils/url-filters';
import { allowClick, clicksToday, normHost, parseClick, recordClick } from '$lib/server/button-clicks';

// Открытый адрес счётчика (без входа): сайт сообщает «нажали кнопку».
// Считаем только ваши сайты из подключённых консолей, с ограничением частоты.
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

const EMPTY = () =>
  new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const e = parseClick(url.searchParams, request.headers.get('referer'));
  if (!e) return EMPTY();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || getClientAddress();
  try {
    if (!(await knownHosts()).has(e.host)) return EMPTY();
    if (!allowClick(ip, e)) return EMPTY();
    if (clicksToday(db(), e.host) >= MAX_PER_SITE_DAY) return EMPTY();
    recordClick(db(), e);
  } catch {
    /* счётчик не должен ломать сайт */
  }
  return EMPTY();
};
