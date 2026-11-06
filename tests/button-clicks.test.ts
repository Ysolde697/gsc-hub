import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { parseClick, recordClick, clicksForRange, allowClick, lastSeen, parseTime, recordTime, timeForRange, pageSnippet, workerScript, parseWorkerEvent, isBotUA, countedHosts, rememberEntry, entrySource, recordCheckoutSource, checkoutSourcesForRange } from '../src/lib/server/button-clicks';
import { isPublicPath } from '../src/lib/server/guard';

const q = (o: Record<string, string>) => new URLSearchParams(o);

describe('parseClick', () => {
  it('сайт — из Referer, без www', () => {
    expect(parseClick(q({ k: 'submit', p: '/', l: 'Continue to checkout', t: '/go/' }), 'https://www.fc-27.com/')).toEqual({
      host: 'fc-27.com', page: '/', kind: 'submit', label: 'Continue to checkout', target: '/go/'
    });
  });
  it('без Referer — из h; мусор отклоняем', () => {
    expect(parseClick(q({ k: 'button', h: 'futcoin.es', l: 'Comprar monedas' }), null)?.host).toBe('futcoin.es');
    expect(parseClick(q({ k: 'hack', h: 'futcoin.es' }), null)).toBeNull();
    expect(parseClick(q({ k: 'button', h: 'evil host/<x>' }), null)).toBeNull();
  });
  it('пустой текст кнопки и длинные строки', () => {
    const e = parseClick(q({ k: 'out', l: '   ', t: 'x'.repeat(999) }), 'https://fccoins.de/')!;
    expect(e.label).toBe('(без текста)');
    expect(e.target.length).toBe(300);
  });
});

describe('recordClick / clicksForRange', () => {
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
  it('помнит домены, от которых уже принимали события (клики и время)', () => {
    recordClick(db, { host: 'a.com', page: '/', kind: 'view', label: '(без текста)', target: '' }, '2026-10-28');
    recordTime(db, { host: 'b.com', page: '/', seconds: 5 }, '2026-10-29');
    expect([...countedHosts(db)].sort()).toEqual(['a.com', 'b.com']);
  });
  it('переход к оплате записывается на источник входа того же посетителя (30 минут)', () => {
    const t0 = Date.parse('2026-11-06T10:00:00Z');
    rememberEntry('ip1', 'a.com', 'utm:chatgpt.com', t0);
    rememberEntry('ip1', 'a.com', '(internal)', t0 + 60_000); // переход внутри сайта не перебивает
    expect(entrySource('ip1', 'a.com', t0 + 10 * 60_000)).toBe('utm:chatgpt.com');
    expect(entrySource('ip1', 'b.com', t0 + 10 * 60_000)).toBe('');
    expect(entrySource('ip1', 'a.com', t0 + 31 * 60_000)).toBe('');
    expect(entrySource('worker', 'a.com', t0)).toBe('');
    recordCheckoutSource(db, 'a.com', 'utm:chatgpt.com', '2026-11-06');
    recordCheckoutSource(db, 'a.com', 'utm:chatgpt.com', '2026-11-06');
    recordCheckoutSource(db, 'a.com', '', '2026-11-06');
    expect(checkoutSourcesForRange(db, '2026-11-01', '2026-11-06').sort((x, y) => x.source.localeCompare(y.source))).toEqual([
      { host: 'a.com', source: '(unknown)', n: 1 },
      { host: 'a.com', source: 'utm:chatgpt.com', n: 2 }
    ]);
  });
  it('суммирует по дням', () => {
    const e = { host: 'fccoins.co.uk', page: '/', kind: 'submit' as const, label: 'Go to the checkout', target: '/order/' };
    recordClick(db, e, '2026-10-28');
    recordClick(db, e, '2026-10-29');
    recordClick(db, e, '2026-10-29');
    expect(clicksForRange(db, '2026-10-29', '2026-10-29')[0].n).toBe(2);
    expect(clicksForRange(db, '2026-10-01', '2026-10-29')[0].n).toBe(3);
    expect(lastSeen(db)).toEqual({ 'fccoins.co.uk': '2026-10-29' });
  });
  it('время на странице: сумма секунд, не больше 30 минут за раз', () => {
    const t = parseTime(new URLSearchParams({ k: 'time', p: '/faq/', d: '42' }), 'https://fccoins.de/')!;
    expect(t).toEqual({ host: 'fccoins.de', page: '/faq/', seconds: 42 });
    expect(parseTime(new URLSearchParams({ k: 'time', p: '/', d: '99999' }), 'https://fccoins.de/')!.seconds).toBe(1800);
    expect(parseTime(new URLSearchParams({ k: 'time', p: '/', d: '-5' }), 'https://fccoins.de/')).toBeNull();
    recordTime(db, t, '2026-10-29');
    recordTime(db, t, '2026-10-29');
    expect(timeForRange(db, '2026-10-29', '2026-10-29')).toEqual([{ host: 'fccoins.de', page: '/faq/', seconds: 84 }]);
  });
});

describe('allowClick', () => {
  it('двойной клик в течение 3 секунд — один раз', () => {
    const e = { host: 'a.com', page: '/', kind: 'button' as const, label: 'Buy', target: '/go/' };
    expect(allowClick('1.1.1.1', e, 1000)).toBe(true);
    expect(allowClick('1.1.1.1', e, 2000)).toBe(false);
    expect(allowClick('1.1.1.1', e, 9000)).toBe(true);
  });
  it('не больше 120 событий с IP за 10 минут', () => {
    let ok = 0;
    for (let i = 0; i < 200; i++) if (allowClick('2.2.2.2', { host: 'a.com', page: '/' + i, kind: 'link', label: 'x', target: '' }, 50_000 + i * 10_000 / 200)) ok++;
    expect(ok).toBe(120);
  });
});

it('код страницы и Worker — корректный JavaScript; адреса панели в странице нет', () => {
  const snip = pageSnippet();
  expect(() => new Function(snip)).not.toThrow();
  expect(snip).not.toContain('sslip');
  const w = workerScript('https://panel.example');
  expect(() => new Function(w.replace('export default', 'return'))).not.toThrow();
  expect(w).toContain('"https://panel.example/c"');
  // ключ — только в секрете Worker
  expect(w).toContain('env.COUNTER_KEY');
  expect(w).toContain('<script src="');
});

it('просмотр несёт источник: домен, прямой заход, внутри сайта; старый код — без источника', () => {
  const view = (r?: string) => parseWorkerEvent({ h: 'fut-coins.nl', e: JSON.stringify(r === undefined ? { k: 'view', p: '/' } : { k: 'view', p: '/', r }) });
  expect(view('www.google.de')).toMatchObject({ click: { kind: 'view', target: 'google.de' } });
  expect(view('')).toMatchObject({ click: { kind: 'view', target: '(direct)' } });
  expect(view('=')).toMatchObject({ click: { kind: 'view', target: '(internal)' } });
  expect(view()).toMatchObject({ click: { kind: 'view', target: '' } });
});

it('код страницы передаёт, откуда пришёл посетитель', async () => {
  async function run(referrer: string, navType = 'navigate', search = '') {
    const sent: Promise<string>[] = [];
    const doc = { referrer, visibilityState: 'visible', addEventListener() {} };
    const loc = { host: 'fut-coins.nl', pathname: '/', search };
    const nav = { sendBeacon: (_p: string, b: Blob) => { sent.push(b.text()); return true; } };
    const perf = { getEntriesByType: () => [{ type: navType }] };
    const store = { getItem: () => null, removeItem() {}, setItem() {} };
    new Function('window', 'document', 'location', 'navigator', 'performance', 'sessionStorage', 'addEventListener', pageSnippet())(
      {}, doc, loc, nav, perf, store, () => {}
    );
    const first = JSON.parse(await sent[0]);
    return first;
  }
  expect(await run('https://www.google.com/')).toMatchObject({ k: 'view', r: 'www.google.com' });
  expect(await run('')).toMatchObject({ k: 'view', r: '' });
  expect(await run('https://fut-coins.nl/faq/')).toMatchObject({ k: 'view', r: '=' });
  expect(await run('https://www.google.com/', 'reload')).toMatchObject({ k: 'view', r: '=' });
  expect(await run('', 'navigate', '?utm_source=newsletter')).toMatchObject({ k: 'view', r: 'utm:newsletter' });
});

it('parseWorkerEvent и боты', () => {
  expect(parseWorkerEvent({ h: 'www.fccoins.fr', e: JSON.stringify({ k: 'submit', p: '/order/', l: 'Commander', t: '/order/' }) })).toEqual({
    click: { host: 'fccoins.fr', page: '/order/', kind: 'submit', label: 'Commander', target: '/order/' }
  });
  expect(parseWorkerEvent({ h: 'fccoins.fr', e: JSON.stringify({ k: 'time', p: '/', d: 12 }) })).toEqual({ time: { host: 'fccoins.fr', page: '/', seconds: 12 } });
  expect(parseWorkerEvent({ h: 'fccoins.fr', e: '{bad' })).toBeNull();
  expect(isBotUA('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
  expect(isBotUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/130')).toBe(true);
  expect(isBotUA('')).toBe(true);
  expect(isBotUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 GSCHubCheck/1')).toBe(true);
  expect(isBotUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
});

it('счётчик открыт без входа, остальное — нет', () => {
  expect(isPublicPath('/c')).toBe(true);
  expect(isPublicPath('/c.js')).toBe(true);
  expect(isPublicPath('/clicks')).toBe(false);
});
