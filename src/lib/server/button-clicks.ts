// Счётчик нажатий кнопок на ваших сайтах. Сайт подключает /c.js, тот при
// нажатии шлёт GET /c?… — здесь только +1 к суммам за день (по Германии).
import type { Db } from './db';
import { localToday } from './gsc-calendar';

export const CLICK_KINDS = ['submit', 'button', 'out', 'link', 'view'] as const;
export type ClickKind = (typeof CLICK_KINDS)[number];

export interface ClickEvent {
  host: string;
  page: string;
  kind: ClickKind;
  label: string;
  target: string;
}

const clean = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export const normHost = (h: string) => h.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');

/**
 * Разобрать параметры запроса счётчика. Сайт берём из Referer (его выставляет
 * браузер), а если сайт его не отправляет — из параметра h.
 */
export function parseClick(params: URLSearchParams, referer: string | null): ClickEvent | null {
  let host = '';
  try {
    host = normHost(new URL(referer ?? '').hostname);
  } catch {
    host = normHost(clean(params.get('h'), 253));
  }
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  const kind = params.get('k') as ClickKind;
  if (!host || !(CLICK_KINDS as readonly string[]).includes(kind)) return null;
  let page = clean(params.get('p'), 300) || '/';
  if (!page.startsWith('/')) page = '/' + page;
  return { host, page, kind, label: clean(params.get('l'), 80) || '(без текста)', target: clean(params.get('t'), 300) };
}

export function recordClick(db: Db, e: ClickEvent, day: string = localToday()): void {
  db.prepare(
    `INSERT INTO button_clicks (day, host, page, kind, label, target, n) VALUES (?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(day, host, page, kind, label, target) DO UPDATE SET n = n + 1`
  ).run(day, e.host, e.page, e.kind, e.label, e.target);
}

/** Сколько событий сайт уже прислал сегодня — потолок от накрутки. */
export function clicksToday(db: Db, host: string, day: string = localToday()): number {
  const r = db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM button_clicks WHERE host = ? AND day = ?').get(host, day) as { n: number };
  return r.n;
}

export interface ClickRow { host: string; page: string; kind: ClickKind; label: string; target: string; n: number }

export function clicksForRange(db: Db, startDate: string, endDate: string): ClickRow[] {
  return db
    .prepare(
      `SELECT host, page, kind, label, target, SUM(n) AS n FROM button_clicks
       WHERE day >= ? AND day <= ? GROUP BY host, page, kind, label, target ORDER BY n DESC`
    )
    .all(startDate, endDate) as ClickRow[];
}

/** Когда от сайта последний раз приходили данные — проверка установки. */
export function lastSeen(db: Db): Record<string, string> {
  const rows = db.prepare('SELECT host, MAX(day) AS day FROM button_clicks GROUP BY host').all() as { host: string; day: string }[];
  return Object.fromEntries(rows.map((r) => [r.host, r.day]));
}

// Ограничение частоты в памяти: с одного IP не больше LIMIT событий за окно,
// повтор того же нажатия в течение DEDUPE_MS не считаем (двойной клик).
const WINDOW_MS = 10 * 60_000;
const LIMIT = 120;
const DEDUPE_MS = 3_000;
const perIp = new Map<string, { n: number; reset: number }>();
const recent = new Map<string, number>();

export function allowClick(ip: string, e: ClickEvent, now: number = Date.now()): boolean {
  const cur = perIp.get(ip);
  if (!cur || cur.reset < now) perIp.set(ip, { n: 1, reset: now + WINDOW_MS });
  else if (++cur.n > LIMIT) return false;
  const k = `${ip}\n${e.host}\n${e.page}\n${e.kind}\n${e.label}\n${e.target}`;
  const last = recent.get(k);
  recent.set(k, now);
  if (perIp.size > 50_000 || recent.size > 50_000) {
    for (const [key, v] of perIp) if (v.reset < now) perIp.delete(key);
    for (const [key, t] of recent) if (now - t > DEDUPE_MS) recent.delete(key);
  }
  return !(last && now - last < DEDUPE_MS);
}

/** Скрипт для сайтов: одна строка <script async src=".../c.js"></script>. */
export function counterScript(origin: string): string {
  return `/* GSC Hub: счётчик нажатий кнопок. Без cookie и личных данных. */
(function () {
  if (window.__gscHubClicks) return;
  window.__gscHubClicks = 1;
  var E = ${JSON.stringify(origin + '/c')};
  function send(k, l, t) {
    var u = E + '?k=' + k + '&h=' + encodeURIComponent(location.hostname) + '&p=' + encodeURIComponent(location.pathname) + '&l=' + encodeURIComponent((l || '').trim().slice(0, 80)) + '&t=' + encodeURIComponent((t || '').slice(0, 300));
    try { fetch(u, { mode: 'no-cors', keepalive: true, credentials: 'omit' }); } catch (e) { new Image().src = u; }
  }
  // Просмотр страницы — один раз при открытии.
  send('view', '', '');
  function label(el) { return el.getAttribute('data-track') || el.getAttribute('aria-label') || el.innerText || el.value || el.title || ''; }
  function where(href) {
    try { var u = new URL(href, location.href); return u.host === location.host ? u.pathname + u.search + u.hash : u.host + u.pathname; } catch (e) { return href || ''; }
  }
  var BTN = /(^|[\\s_-])(btn|button|boton|bouton|knop|pulsante|kick|cta)/i;
  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest && ev.target.closest('a,button,[data-track],input[type=submit]');
    if (!el) return;
    var isSubmit = (el.tagName === 'BUTTON' && (el.type || 'submit') === 'submit' && el.form) || (el.tagName === 'INPUT' && el.form);
    if (isSubmit) return; // считаем отправку формы ниже
    var href = el.getAttribute('href') || '';
    var cls = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('rel') || '');
    var kind = 'link';
    if (el.tagName === 'A' && href && !/^(#|javascript:|mailto:|tel:)/i.test(href)) {
      try { if (new URL(href, location.href).host !== location.host) kind = 'out'; } catch (e) {}
    }
    if (kind === 'link' && (el.hasAttribute('data-track') || el.tagName === 'BUTTON' || BTN.test(cls) || /sponsored/i.test(cls))) kind = 'button';
    send(kind, label(el), href ? where(href) : '');
  }, true);
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (!f || f.tagName !== 'FORM') return;
    var b = ev.submitter || f.querySelector('button[type=submit],button:not([type]),input[type=submit]');
    send('submit', b ? label(b) : (f.getAttribute('data-track') || 'форма'), where(f.getAttribute('action') || location.pathname));
  }, true);
})();
`;
}
