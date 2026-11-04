import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { counterKeyOk } from '$lib/server/config';
import { normHost, siteCounterConfig } from '$lib/server/button-clicks';

// Настройки счётчика для Cloudflare Worker сайта: адрес файла счётчика, адрес
// событий и сам файл. Worker спрашивает их раз в 10 минут, поэтому всё, что
// меняется в счётчике, меняется здесь, а код Worker на сайтах остаётся прежним.
// Без входа, но только с действующим ключом счётчика; без него — 403, ничего не раскрываем.
const DENY = () => new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });

export const GET: RequestHandler = ({ url, request }) => {
  const host = normHost(url.searchParams.get('h') ?? '');
  const key = request.headers.get('x-counter-key');
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return DENY();
  if (!key || !counterKeyOk(db(), key, host)) return DENY();
  return new Response(JSON.stringify(siteCounterConfig(host, key)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=600' }
  });
};
