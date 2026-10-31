import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { parseClick, recordClick, clicksForRange, allowClick, lastSeen, parseTime, recordTime, timeForRange, pageSnippet, workerScript, parseWorkerEvent, isBotUA } from '../src/lib/server/button-clicks';
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
