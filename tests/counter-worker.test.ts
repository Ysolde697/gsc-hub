// Код Worker сайта целиком, вместе с настоящими ручками панели /c/site и /c:
// страница → файл счётчика → событие → запись в базе панели.
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { openDb, type Db } from '../src/lib/server/db';
import { ensureCounterKey } from '../src/lib/server/config';
import { clicksForRange, siteCounterConfig, workerScript } from '../src/lib/server/button-clicks';

let testDb: Db;
vi.mock('../src/lib/server/db', async (original) => ({ ...(await original<typeof import('../src/lib/server/db')>()), db: () => testDb }));
vi.mock('../src/lib/server/google', () => ({ listAllKnownSites: async () => ({ sites: [{ siteUrl: 'sc-domain:fut-coins.nl' }] }) }));
import { GET as siteConfigGET } from '../src/routes/c/site/+server';
import { POST as counterPOST } from '../src/routes/c/+server';

const PANEL = 'https://panel.example';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const PAGE = '<!doctype html><html><head><title>FUT</title></head><body><a href="/kassa/">Koop</a></body></html>';
type WorkerMod = { fetch: (r: Request, env: unknown, ctx: unknown) => Promise<Response> };

/** Свежий Worker (своя память настроек), как после Deploy. */
const loadWorker = () => new Function(workerScript(PANEL).replace('export default', 'return'))() as WorkerMod;

/** HTMLRewriter есть только в Cloudflare: здесь — простая замена для <head>. */
class FakeRewriter {
  private add = '';
  on(sel: string, h: { element: (el: { append: (s: string) => void }) => void }) {
    if (sel === 'head') h.element({ append: (s) => (this.add += s) });
    return this;
  }
  transform(res: Response) {
    return res.text().then((html) => new Response(html.replace('</head>', this.add + '</head>'), { status: res.status, headers: res.headers }));
  }
}

let originCalls: string[];
let panel: 'ok' | 'down' | 'hang';
let key: string;
let waits: Promise<unknown>[];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
const settle = async () => {
  while (waits.length) await Promise.all(waits.splice(0));
};

beforeEach(() => {
  testDb = openDb(':memory:');
  key = ensureCounterKey(testDb);
  originCalls = [];
  waits = [];
  panel = 'ok';
  vi.stubGlobal('HTMLRewriter', FakeRewriter);
  vi.stubGlobal('fetch', async (input: string | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const u = new URL(req.url);
    if (u.origin === PANEL) {
      if (panel === 'down') throw new TypeError('fetch failed');
      if (panel === 'hang') return new Promise<Response>(() => {});
      if (u.pathname === '/c/site') return siteConfigGET({ url: u, request: req } as never);
      if (u.pathname === '/c') return counterPOST({ request: req } as never);
      return new Response(null, { status: 404 });
    }
    originCalls.push(u.pathname);
    if (u.pathname === '/') return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (u.pathname === '/kassa/') return new Response(null, { status: 302, headers: { Location: 'https://onlyfarms.gg/category/ea-fc-boost/coins' } });
    return new Response('not found', { status: 404 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  testDb.close();
});

const page = (w: WorkerMod, env: unknown, path = '/', headers: Record<string, string> = {}) =>
  w.fetch(new Request('https://fut-coins.nl' + path, { headers: { 'Sec-Fetch-Dest': 'document', 'User-Agent': UA, ...headers } }), env, ctx);

/** Запустить файл счётчика как браузер; вернуть тело первого события. */
async function firstEvent(js: string): Promise<string> {
  const sent: Promise<string>[] = [];
  const doc = { referrer: 'https://www.google.com/', visibilityState: 'visible', addEventListener() {} };
  const loc = { host: 'fut-coins.nl', pathname: '/', search: '', href: 'https://fut-coins.nl/' };
  const nav = { sendBeacon: (_u: string, b: Blob) => (sent.push(b.text()), true) };
  new Function('window', 'document', 'location', 'navigator', 'performance', 'sessionStorage', 'addEventListener', js)(
    {}, doc, loc, nav, { getEntriesByType: () => [{ type: 'navigate' }] }, { getItem: () => null, removeItem() {}, setItem() {} }, () => {}
  );
  return sent[0];
}

it('страница → файл счётчика из панели → просмотр записан в панели', async () => {
  const w = loadWorker();
  const env = { COUNTER_KEY: key };
  const cfg = siteCounterConfig('fut-coins.nl', key);

  const html = await (await page(w, env)).text();
  expect(html).toContain(`<script src="${cfg.script}" defer></script></head>`);

  const file = await page(w, env, cfg.script, { 'Sec-Fetch-Dest': 'script' });
  expect(await file.text()).toBe(cfg.js);
  expect(originCalls).toEqual(['/']); // файл счётчика отдаёт Worker, сайт не спрашивает

  const body = await firstEvent(cfg.js);
  const res = await w.fetch(new Request('https://fut-coins.nl' + cfg.events, { method: 'POST', body, headers: { 'User-Agent': UA, 'CF-Connecting-IP': '203.0.113.7' } }), env, ctx);
  expect(res.status).toBe(204);
  await settle();
  expect(clicksForRange(testDb, '2000-01-01', '2100-01-01')).toEqual([
    { host: 'fut-coins.nl', page: '/', kind: 'view', label: '(без текста)', target: 'google.com', n: 1 }
  ]);
});

it('переход к оплате перенаправлением засчитывается, ответ сайта не меняется', async () => {
  const w = loadWorker();
  const res = await page(w, { COUNTER_KEY: key }, '/kassa/', { Referer: 'https://fut-coins.nl/' });
  expect(res.status).toBe(302);
  await settle();
  expect(clicksForRange(testDb, '2000-01-01', '2100-01-01')).toMatchObject([{ host: 'fut-coins.nl', page: '/', kind: 'submit', label: 'Переход к оплате', target: '/kassa/' }]);
});

it('панель лежит — сайт работает как обычно, без счётчика', async () => {
  panel = 'down';
  const res = await page(loadWorker(), { COUNTER_KEY: key });
  expect(res.status).toBe(200);
  expect(await res.text()).toBe(PAGE);
});

it('панель не отвечает — первая страница ждёт не дольше секунды, следующие не ждут', async () => {
  panel = 'hang';
  const w = loadWorker();
  let t = Date.now();
  expect(await (await page(w, { COUNTER_KEY: key })).text()).toBe(PAGE);
  expect(Date.now() - t).toBeLessThan(1800);
  t = Date.now();
  expect(await (await page(w, { COUNTER_KEY: key })).text()).toBe(PAGE);
  expect(Date.now() - t).toBeLessThan(200);
  waits = []; // зависший запрос к панели не ждём
});

it('неверный ключ — панель ничего не отдаёт, на сайте ничего не меняется', async () => {
  const w = loadWorker();
  const env = { COUNTER_KEY: 'wrong-key-123' };
  expect(await (await page(w, env)).text()).toBe(PAGE);
  const cfg = siteCounterConfig('fut-coins.nl', key);
  expect((await page(w, env, cfg.script)).status).toBe(404); // ушло на сайт
  const r = await siteConfigGET({ url: new URL(PANEL + '/c/site?h=fut-coins.nl'), request: new Request(PANEL + '/c/site', { headers: { 'X-Counter-Key': 'wrong-key-123' } }) } as never);
  expect(r.status).toBe(403);
  expect(await r.text()).toBe('');
});

it('настройки обновляются сами: новый файл из панели подхватывается без правки Worker', async () => {
  const w = loadWorker();
  const env = { COUNTER_KEY: key };
  await page(w, env);
  await settle();
  const calls = () => originCalls.length;
  const before = calls();
  // 10 минут спустя Worker снова спрашивает панель
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 11 * 60_000);
  let asked = false;
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', (input: string | Request, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.startsWith(PANEL + '/c/site')) asked = true;
    return real(input, init);
  });
  await page(w, env);
  await settle();
  expect(asked).toBe(true);
  expect(calls()).toBe(before + 1);
  vi.restoreAllMocks();
});
