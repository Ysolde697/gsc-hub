import { describe, it, expect } from 'vitest';
import { analyze, findOrderPath, shingles, similarity, pageText, netError, type FetchResult } from '../src/lib/server/uptime';

const page = (body: string, extra: Partial<FetchResult> = {}): FetchResult => ({
  ok: true, status: 200, ms: 300, finalUrl: 'https://fccoins.fr/', chain: [], contentType: 'text/html; charset=utf-8', body, ...extra
});
const normal = '<html><head><title>FC Coins France</title></head><body>' + 'Acheter des crédits FC 27 rapidement et en toute sécurité. '.repeat(30) + '<form action="/order/" method="get"><button>Commander</button></form></body></html>';

describe('analyze', () => {
  it('нормальная страница — ок, и совпадает с эталоном', () => {
    const a = analyze('home', 'fccoins.fr', page(normal), null);
    expect(a.level).toBe('ok');
    const b = analyze('home', 'fccoins.fr', page(normal), { title: a.title, textLen: a.textLen, shingles: a.shingles });
    expect(b.level).toBe('ok');
    expect(b.similarity).toBe(1);
  });
  it('ошибки и заглушки', () => {
    expect(analyze('home', 'fccoins.fr', page('', { ok: false, status: null, error: 'не ответил за 15 секунд' }), null).problems[0].text).toContain('не ответил');
    expect(analyze('home', 'fccoins.fr', page(normal, { status: 503 }), null).level).toBe('error');
    expect(analyze('home', 'fccoins.fr', page('<title>fccoins.fr</title>This domain is for sale! Buy this domain today. ' + 'x '.repeat(200)), null).problems.map((p) => p.text).join()).toContain('домен продаётся');
    expect(analyze('home', 'fccoins.fr', page('<title>Just a moment...</title><body>Checking your browser before accessing</body>'), null).problems.some((p) => p.text.includes('Cloudflare'))).toBe(true);
  });
  it('парковка по описанию страницы (abovedomains)', () => {
    const parked = '<head><title>planetbaobab.co</title><meta name="description" content="This domain may be for sale."><script src="https://assets.abovedomains.com/javascript/forsale.min.js"></script></head><body></body>';
    const a = analyze('home', 'planetbaobab.co', page(parked, { finalUrl: 'https://planetbaobab.co/' }), null);
    expect(a.level).toBe('error');
    expect(a.problems.map((p) => p.text)).toEqual(['Заглушка «домен продаётся» — похоже, домен не продлён или припаркован']);
  });
  it('редирект на чужой сайт: главная — ошибка, заказ — норма', () => {
    expect(analyze('home', 'fccoins.fr', page(normal, { finalUrl: 'https://evil.example/' }), null).problems[0].text).toContain('evil.example');
    expect(analyze('order', 'fccoins.fr', page('<p>pay</p>', { finalUrl: 'https://onlyfarms.gg/x' }), null).level).toBe('ok');
    expect(analyze('home', 'fccoins.fr', page(normal, { finalUrl: 'https://www.fccoins.fr/' }), null).level).toBe('ok');
  });
  it('подменённая страница: другой заголовок и текст', () => {
    const a = analyze('home', 'fccoins.fr', page(normal), null);
    const hacked = '<title>Cheap pills online</title><body>' + 'Buy cheap pills online without prescription today. '.repeat(30) + '</body>';
    const b = analyze('home', 'fccoins.fr', page(hacked), { title: a.title, textLen: a.textLen, shingles: a.shingles });
    expect(b.level).not.toBe('ok');
    expect(b.problems.map((p) => p.text).join()).toMatch(/Заголовок изменился/);
    expect(b.problems.map((p) => p.text).join()).toMatch(/сильно изменилась/);
  });
});

it('findOrderPath находит action формы заказа', () => {
  expect(findOrderPath(normal, 'https://fccoins.fr/')).toBe('/order/');
  expect(findOrderPath('<form action="https://other.com/x"></form><form action="/search/"></form>', 'https://a.com/')).toBeNull();
});

it('similarity', () => {
  const a = shingles(pageText('один два три четыре пять шесть'));
  expect(similarity(a, a)).toBe(1);
  expect(similarity(a, shingles('совсем другой текст здесь вот так'))).toBe(0);
});

it('netError — понятный текст', () => {
  const e = (code: string, message = '') => Object.assign(new Error('fetch failed'), { cause: { code, message } });
  expect(netError(e('ENOTFOUND'))).toContain('домен не находится');
  expect(netError(e('', '58A2ACDF417F0000:error:0A000126:SSL routines'))).toContain('SSL/TLS');
  expect(netError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toContain('15 секунд');
});
