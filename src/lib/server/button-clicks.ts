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

/** Время на странице: d — секунды показа на экране с прошлой отправки (не больше 30 минут). */
export function parseTime(params: URLSearchParams, referer: string | null): { host: string; page: string; seconds: number } | null {
  const e = parseClick(new URLSearchParams({ ...Object.fromEntries(params), k: 'view' }), referer);
  const d = Math.round(Number(params.get('d')));
  if (!e || !Number.isFinite(d) || d <= 0) return null;
  return { host: e.host, page: e.page, seconds: Math.min(d, 1800) };
}

export function recordTime(db: Db, t: { host: string; page: string; seconds: number }, day: string = localToday()): void {
  db.prepare(
    `INSERT INTO page_time (day, host, page, seconds) VALUES (?, ?, ?, ?)
     ON CONFLICT(day, host, page) DO UPDATE SET seconds = seconds + excluded.seconds`
  ).run(day, t.host, t.page, t.seconds);
}

export function timeForRange(db: Db, startDate: string, endDate: string): { host: string; page: string; seconds: number }[] {
  return db
    .prepare('SELECT host, page, SUM(seconds) AS seconds FROM page_time WHERE day >= ? AND day <= ? GROUP BY host, page')
    .all(startDate, endDate) as { host: string; page: string; seconds: number }[];
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

/** Старый общий скрипт /c.js отключён: он связывал сайты одним внешним адресом. */
export function counterScript(_origin: string): string {
  return '/* GSC Hub: этот счётчик отключён — подсчёт идёт через Cloudflare Worker сайта. */\n';
}

/** Боты и проверялки: их просмотры не считаем. */
export function isBotUA(ua: string): boolean {
  if (!ua || !/mozilla\//i.test(ua)) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|inspectiontool|facebookexternalhit|embedly|quora|pinterest|ahrefs|semrush|mj12|yandex|baidu|bytespider|petal|gptbot|claude|perplexity|python|curl|wget|httpclient|go-http|java\//i.test(ua);
}

/**
 * Событие от Cloudflare Worker сайта: { h: хост, e: JSON события из страницы }.
 * Событие: { k, p, l?, t?, d? }.
 */
export function parseWorkerEvent(
  body: unknown
): { click: ClickEvent } | { time: { host: string; page: string; seconds: number } } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { h?: unknown; e?: unknown };
  let ev: Record<string, unknown>;
  try {
    ev = typeof b.e === 'string' ? JSON.parse(b.e) : (b.e as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!ev || typeof ev !== 'object') return null;
  const params = new URLSearchParams();
  params.set('h', String(b.h ?? ''));
  for (const k of ['k', 'p', 'l', 't', 'd']) if (ev[k] !== undefined && ev[k] !== null) params.set(k, String(ev[k]));
  if (params.get('k') === 'time') {
    const t = parseTime(params, null);
    return t ? { time: t } : null;
  }
  const c = parseClick(params, null);
  return c ? { click: c } : null;
}

/** Путь на самом сайте, куда страница шлёт события (его перехватывает Worker). */
export const SITE_PATH = '/_e';

/**
 * Код, который Worker вставляет в <head> каждой HTML-страницы. Шлёт события
 * на адрес самого сайта — адреса панели в странице нет.
 * «Дошли до оплаты» считается, только когда после отправки формы реально
 * открылась страница из её action (а не когда сайт отказал, например, сумма мала).
 */
export function pageSnippet(path: string = SITE_PATH): string {
  return `(function(){if(window.__ghc)return;window.__ghc=1;var P=${JSON.stringify(path)};
function send(o){o.p=location.pathname;var b=JSON.stringify(o);try{if(navigator.sendBeacon&&navigator.sendBeacon(P,new Blob([b],{type:'application/json'})))return}catch(e){}try{fetch(P,{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'application/json'}})}catch(e){}}
send({k:'view'});
try{var nav=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{};var s=JSON.parse(sessionStorage.getItem('__ghs')||'null');sessionStorage.removeItem('__ghs');if(s&&nav.type!=='reload'&&Date.now()-s.at<600000&&location.pathname===s.a)send({k:'submit',l:s.l,t:s.a})}catch(e){}
var shown=document.visibilityState==='visible'?Date.now():0,acc=0;
function flush(){if(shown){acc+=Date.now()-shown;shown=0}var d=Math.round(acc/1000);if(d<1)return;acc=0;send({k:'time',d:d})}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();else shown=Date.now()});
addEventListener('pagehide',flush);
function label(el){return((el&&(el.getAttribute('data-track')||el.getAttribute('aria-label')||el.innerText||el.value||el.title))||'').trim().slice(0,80)}
function where(h){try{var u=new URL(h,location.href);return u.host===location.host?u.pathname+u.search+u.hash:u.host+u.pathname}catch(e){return h||''}}
var BTN=/(^|[\\s_-])(btn|button|boton|bouton|knop|pulsante|kick|cta)/i;
document.addEventListener('click',function(ev){var el=ev.target&&ev.target.closest&&ev.target.closest('a,button,[data-track],input[type=submit]');if(!el)return;
if((el.tagName==='BUTTON'&&(el.type||'submit')==='submit'&&el.form)||(el.tagName==='INPUT'&&el.form))return;
var h=el.getAttribute('href')||'',c=(el.getAttribute('class')||'')+' '+(el.getAttribute('rel')||''),k='link';
if(el.tagName==='A'&&h&&!/^(#|javascript:|mailto:|tel:)/i.test(h)){try{if(new URL(h,location.href).host!==location.host)k='out'}catch(e){}}
if(k==='link'&&(el.hasAttribute('data-track')||el.tagName==='BUTTON'||BTN.test(c)||/sponsored/i.test(c)))k='button';
send({k:k,l:label(el),t:h?where(h):''})},true);
document.addEventListener('submit',function(ev){var f=ev.target;if(!f||f.tagName!=='FORM')return;var b=ev.submitter||f.querySelector('button[type=submit],button:not([type]),input[type=submit]');var a;try{a=new URL(f.getAttribute('action')||location.pathname,location.href)}catch(e){return}
if(a.host!==location.host){send({k:'out',l:label(b),t:a.host+a.pathname});return}
try{sessionStorage.setItem('__ghs',JSON.stringify({a:a.pathname,l:label(b)||'форма',at:Date.now()}))}catch(e){}},true);
})();`;
}

/** Код Cloudflare Worker: подключает счётчик к страницам и пересылает события в панель. */
export function workerScript(panelOrigin: string, path: string = SITE_PATH): string {
  return `// GSC Hub — счётчик просмотров, времени и кнопок для сайта (Cloudflare Worker).
// На сайте меняется только одно: в <head> HTML-страниц добавляется
// <script src="${path}.js" defer> — файл с адреса самого сайта (его отдаёт этот
// Worker), поэтому защита сайта (Content-Security-Policy: script-src 'self') его пропускает.
// События идут на адрес самого сайта (${path}), Worker пересылает их в панель.
// Ключ панели — в секрете Worker COUNTER_KEY (Settings → Variables and Secrets), не в коде.
const PANEL = ${JSON.stringify(panelOrigin + '/c')};
const PATH = ${JSON.stringify(path)};
const SNIPPET_JS = ${JSON.stringify(pageSnippet(path))};

function forward(env, ctx, request, host, e) {
  if (!env.COUNTER_KEY || e.length > 4000) return;
  ctx.waitUntil(
    fetch(PANEL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Counter-Key': env.COUNTER_KEY,
        'X-Client-IP': request.headers.get('CF-Connecting-IP') || '',
        'X-Client-UA': request.headers.get('User-Agent') || ''
      },
      body: JSON.stringify({ h: host, e })
    }).catch(() => {})
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === PATH + '.js') {
      return new Response(SNIPPET_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (url.pathname === PATH) {
      if (request.method === 'POST') forward(env, ctx, request, url.hostname, await request.text());
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }
    const res = await fetch(request);
    const isPage = request.method === 'GET' && request.headers.get('Sec-Fetch-Dest') === 'document';
    // Переход к оплате сразу перенаправлением на другой сайт (касса): страница
    // сайта не открывается, поэтому считаем здесь — «дошли до оплаты».
    const loc = res.headers.get('Location');
    if (isPage && res.status >= 300 && res.status < 400 && loc) {
      try {
        const to = new URL(loc, url);
        if (to.hostname.replace(/^www\\./, '') !== url.hostname.replace(/^www\\./, '')) {
          const target = (url.pathname + url.search).slice(0, 300);
          forward(env, ctx, request, url.hostname, JSON.stringify({ k: 'submit', p: url.pathname, l: 'Переход к оплате', t: target }));
        }
      } catch (e) {}
      return res;
    }
    if (request.method !== 'GET' || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
    return new HTMLRewriter()
      .on('head', { element(el) { el.append('<script src="' + PATH + '.js" defer></script>', { html: true }); } })
      .transform(res);
  }
};
`;
}
