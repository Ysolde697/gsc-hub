import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/lib/server/db';
import { parseClick, recordClick, clicksForRange, allowClick, counterScript, lastSeen } from '../src/lib/server/button-clicks';
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

it('скрипт — корректный JavaScript, шлёт на этот сервер', () => {
  const js = counterScript('https://panel.example');
  expect(() => new Function(js)).not.toThrow();
  expect(js).toContain('"https://panel.example/c"');
});

it('счётчик открыт без входа, остальное — нет', () => {
  expect(isPublicPath('/c')).toBe(true);
  expect(isPublicPath('/c.js')).toBe(true);
  expect(isPublicPath('/clicks')).toBe(false);
});
