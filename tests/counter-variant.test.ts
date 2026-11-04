import { describe, it, expect, vi, afterEach } from 'vitest';
import { counterVariant, decodeCounterEvent, parseWorkerEvent, pageSnippet, workerScript } from '../src/lib/server/button-clicks';

const KEY = 'test-key-0123456789';
const SITES = ['futcoin.nl', 'futcoin.es', 'fc-27.com', 'futcoins.co.uk', 'fut-coins.nl', 'fut-coins.es', 'futcoin.at'];

/** Запустить код счётчика как в браузере: что он отправил и какие обработчики повесил. */
function run(js: string, opts: { host?: string; referrer?: string; navType?: string } = {}) {
  const host = opts.host ?? 'fut-coins.nl';
  const sent: Promise<string>[] = [];
  const handlers: Record<string, (ev: unknown) => void> = {};
  const doc = { referrer: opts.referrer ?? '', visibilityState: 'visible', addEventListener: (t: string, f: (ev: unknown) => void) => (handlers[t] = f) };
  const loc = { host, pathname: '/', search: '', href: `https://${host}/` };
  const urls: string[] = [];
  const nav = { sendBeacon: (u: string, b: Blob) => { urls.push(u); sent.push(b.text()); return true; } };
  const perf = { getEntriesByType: () => [{ type: opts.navType ?? 'navigate' }] };
  const store = { getItem: () => null, removeItem() {}, setItem() {} };
  new Function('window', 'document', 'location', 'navigator', 'performance', 'sessionStorage', 'addEventListener', js)({}, doc, loc, nav, perf, store, () => {});
  return { sent, handlers, urls };
}

/** Событие от страницы → как его увидит панель (через перевод Worker). */
const toPanel = (host: string, v: ReturnType<typeof counterVariant>, body: string) => parseWorkerEvent({ h: host, e: decodeCounterEvent(v, body) });

describe('у каждого сайта свой счётчик', () => {
  it('у сайтов разные адреса и разный код; сайт с www — тот же вариант', () => {
    const vs = SITES.map((h) => counterVariant(h, KEY));
    expect(new Set(vs.map((v) => v.script)).size).toBe(SITES.length);
    expect(new Set(vs.map((v) => v.events)).size).toBe(SITES.length);
    expect(new Set(vs.map((v) => v.js)).size).toBe(SITES.length);
    for (const v of vs) {
      expect(v.script).toMatch(/^\/[a-z]+\/[a-z][a-z0-9]{5,8}\.js$/);
      expect(v.events).toMatch(/^\/[a-z]+\/[a-z][a-z0-9]{4,7}$/);
    }
    expect(counterVariant('WWW.fut-coins.nl', KEY)).toEqual(counterVariant('fut-coins.nl', KEY));
    expect(counterVariant('fut-coins.nl', 'другой ключ').js).not.toBe(counterVariant('fut-coins.nl', KEY).js);
  });

  it('в коде сайта нет ничего общего с другими: ни кириллицы, ни словаря кнопок, ни старых имён', () => {
    for (const h of SITES) {
      const { js, events } = counterVariant(h, KEY);
      expect(js).not.toMatch(/[а-яё]/i);
      for (const s of ['__ghc', '__ghs', '/_e', 'pulsante', 'sponsored', 'gsc-hub', 'GSC Hub']) expect(js).not.toContain(s);
      expect(js).toContain(JSON.stringify(events));
      for (const other of SITES.filter((o) => o !== h)) expect(js).not.toContain(counterVariant(other, KEY).events);
    }
  });

  it('любой вариант — рабочий код: 300 сайтов, просмотр доходит до панели', async () => {
    for (let i = 0; i < 300; i++) {
      const host = `site-${i}.example`;
      const v = counterVariant(host, KEY);
      expect(() => new Function(v.js)).not.toThrow();
      const { sent, urls } = run(v.js, { host, referrer: 'https://www.google.com/' });
      expect(urls[0]).toBe(v.events);
      expect(toPanel(host, v, await sent[0])).toEqual({ click: { host, page: '/', kind: 'view', label: '(без текста)', target: 'google.com' } });
    }
  });

  it('кнопку по классу ссылки определяет панель; форма без текста кнопки — «форма»', async () => {
    const v = counterVariant('fut-coins.nl', KEY);
    const { sent, handlers } = run(v.js);
    const link = (attrs: Record<string, string>, tag = 'A') => ({
      tagName: tag, innerText: 'Koop nu', getAttribute: (n: string) => attrs[n] ?? null, hasAttribute: (n: string) => n in attrs
    });
    handlers.click({ target: { closest: () => link({ href: '/kassa/?p=ps', class: 'koop-btn' }) } });
    handlers.click({ target: { closest: () => link({ href: '/faq/' }) } });
    handlers.click({ target: { closest: () => link({ href: 'https://onlyfarms.gg/x' }) } });
    const got = await Promise.all(sent.slice(1).map(async (b) => toPanel('fut-coins.nl', v, await b)));
    expect(got.map((g) => g && 'click' in g && [g.click.kind, g.click.target])).toEqual([
      ['button', '/kassa/?p=ps'],
      ['link', '/faq/'],
      ['out', 'onlyfarms.gg/x']
    ]);
    expect(parseWorkerEvent({ h: 'fut-coins.nl', e: JSON.stringify({ k: 'submit', p: '/', t: '/kassa/' }) })).toMatchObject({ click: { kind: 'submit', label: 'форма' } });
  });

  it('обычный код (для проверок) по-прежнему шлёт события со старыми названиями', async () => {
    const { sent } = run(pageSnippet(), { referrer: 'https://www.google.com/' });
    expect(JSON.parse(await sent[0])).toMatchObject({ k: 'view', r: 'www.google.com' });
  });

  it('чужое и битое тело события не пересылается', () => {
    const v = counterVariant('fut-coins.nl', KEY);
    expect(decodeCounterEvent(v, '{bad')).toBeNull();
    expect(decodeCounterEvent(v, JSON.stringify({ k: 'view' }))).toBeNull();
    expect(decodeCounterEvent(v, '[1,2]')).toBeNull();
  });
});

describe('Worker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('собирает тот же вариант, что панель, отдаёт файл и пересылает событие в панель', async () => {
    const mod = new Function(workerScript('https://panel.example').replace('export default', 'return'))() as {
      fetch: (r: Request, env: unknown, ctx: unknown) => Promise<Response>;
    };
    const env = { COUNTER_KEY: KEY };
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
    const v = counterVariant('fut-coins.nl', KEY);

    const file = await mod.fetch(new Request('https://www.fut-coins.nl' + v.script), env, ctx);
    expect(file.headers.get('Content-Type')).toContain('javascript');
    expect(await file.text()).toBe(v.js);

    const { sent } = run(v.js, { referrer: 'https://www.google.com/' });
    const calls: { url: string; body: string; ua: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string | Request, init?: RequestInit) => {
      if (url instanceof Request) calls.push({ url: url.url, body: '', ua: null });
      else calls.push({ url, body: String(init?.body), ua: new Headers(init?.headers).get('X-Client-UA') });
      return new Response(null, { status: 204 });
    });
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
    const res = await mod.fetch(new Request('https://fut-coins.nl' + v.events, { method: 'POST', body: await sent[0], headers: { 'User-Agent': ua } }), env, ctx);
    await Promise.all(waits);
    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://panel.example/c');
    expect(calls[0].ua).toBe(ua);
    const body = JSON.parse(calls[0].body);
    expect(body.h).toBe('fut-coins.nl');
    expect(parseWorkerEvent(body)).toEqual({ click: { host: 'fut-coins.nl', page: '/', kind: 'view', label: '(без текста)', target: 'google.com' } });

    // Старый адрес /_e.js этот Worker больше не отдаёт — запрос уходит на сайт.
    const old = await mod.fetch(new Request('https://fut-coins.nl/_e.js'), env, ctx);
    expect(old.status).toBe(204); // ответ заглушки сайта
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://fut-coins.nl/_e.js');
  });
});
