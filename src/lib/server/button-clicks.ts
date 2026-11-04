// Счётчик нажатий кнопок на ваших сайтах. Сайт подключает /c.js, тот при
// нажатии шлёт GET /c?… — здесь только +1 к суммам за день (по Германии).
import { createHash } from 'node:crypto';
import type { Db } from './db';
import { localToday } from './gsc-calendar';
import { storedSource } from '$lib/utils/traffic-source';

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
  // У просмотра target — откуда пришёл посетитель (см. traffic-source.ts).
  const target = kind === 'view' && params.has('r') ? storedSource(clean(params.get('r'), 120)) : clean(params.get('t'), 300);
  return { host, page, kind, label: clean(params.get('l'), 80) || '(без текста)', target };
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

/**
 * Домены, от которых счётчик уже принимал события. Приём не должен зависеть
 * от того, ответил ли Google прямо сейчас: если консоль временно недоступна,
 * события её сайтов всё равно записываются.
 */
export function countedHosts(db: Db): Set<string> {
  const rows = db.prepare('SELECT DISTINCT host FROM button_clicks UNION SELECT DISTINCT host FROM page_time').all() as { host: string }[];
  return new Set(rows.map((r) => r.host));
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
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|inspectiontool|facebookexternalhit|embedly|quora|pinterest|ahrefs|semrush|mj12|yandex|baidu|bytespider|petal|gptbot|claude|perplexity|python|curl|wget|httpclient|go-http|java\/|gschubcheck|uptime|monitor|pingdom|statuscake/i.test(ua);
}

/** Класс ссылки, по которому она считается кнопкой (кнопки на разных языках, рекламные ссылки). */
const BUTTON_CLASS = /(^|[\s_-])(btn|button|boton|bouton|knop|pulsante|kick|cta)|sponsored/i;

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
  for (const k of ['k', 'p', 'l', 't', 'd', 'r']) if (ev[k] !== undefined && ev[k] !== null) params.set(k, String(ev[k]));
  // Счётчик сайта не решает сам, кнопка ли это: присылает класс ссылки (c) и
  // признак кнопки (b), решаем здесь — словаря кнопок в странице нет.
  if (params.get('k') === 'link' && (ev.b || BUTTON_CLASS.test(String(ev.c ?? '')))) params.set('k', 'button');
  if (params.get('k') === 'submit' && !params.get('l')) params.set('l', 'форма');
  if (params.get('k') === 'time') {
    const t = parseTime(params, null);
    return t ? { time: t } : null;
  }
  const c = parseClick(params, null);
  return c ? { click: c } : null;
}

/** Старый общий путь событий. Новый Worker у каждого сайта берёт свой (см. counterVariant). */
export const SITE_PATH = '/_e';

/**
 * Код счётчика для страницы — заготовка с метками:
 *   @имя@   — имя переменной или свойства,
 *   #поле#  — название поля в событии,
 *   $вид$   — вид события ('view', 'link'…), в кавычках,
 *   %EV%    — адрес, куда слать события, %SK% — ключ в sessionStorage.
 * Блоки между head и tail друг от друга не зависят: у каждого сайта свой порядок.
 * Просмотр несёт r — откуда пришёл посетитель: домен прошлого сайта, '' — без
 * адреса (прямой заход), '=' — переход внутри сайта, обновление или «Назад».
 * «Перешли к оплате» записывается на ту страницу, где нажали кнопку, и только
 * когда после отправки формы реально открылась страница из её action.
 * Что считать кнопкой, решает панель (по классу ссылки), — в странице этого нет.
 */
const COUNTER_HEAD = String.raw`(function(){if(window.@G@)return;window.@G@=1;var @P@=%EV%;
function @send@(@o@){if(!@o@.#p#)@o@.#p#=location.pathname;var @b@=JSON.stringify(@o@);try{if(navigator.sendBeacon&&navigator.sendBeacon(@P@,new Blob([@b@],{type:'application/json'})))return}catch(@e@){}try{fetch(@P@,{method:'POST',body:@b@,keepalive:true,headers:{'Content-Type':'application/json'}})}catch(@e@){}}
var @nav@={};try{@nav@=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{}}catch(@e@){}
var @r@='';try{if(document.referrer){var @ru@=new URL(document.referrer);@r@=@ru@.host===location.host?'=':@ru@.host}}catch(@e@){@r@='?'}
if(@nav@.type==='reload'||@nav@.type==='back_forward')@r@='=';
if(@r@===''){try{var @us@=new URLSearchParams(location.search).get('utm_source');if(@us@)@r@='utm:'+@us@}catch(@e@){}}
@send@({#k#:$view$,#r#:@r@});
try{var @s@=JSON.parse(sessionStorage.getItem(%SK%)||'null');sessionStorage.removeItem(%SK%);if(@s@&&@nav@.type!=='reload'&&Date.now()-@s@.@sat@<600000&&location.pathname===@s@.@sa@)@send@({#k#:$submit$,#l#:@s@.@sl@,#t#:@s@.@sa@,#p#:@s@.@sf@||@s@.@sa@})}catch(@e@){}
`;
const COUNTER_BLOCKS = [
  String.raw`var @sh@=document.visibilityState==='visible'?Date.now():0,@acc@=0;
function @flush@(){if(@sh@){@acc@+=Date.now()-@sh@;@sh@=0}var @d@=Math.round(@acc@/1000);if(@d@<1)return;@acc@=0;@send@({#k#:$time$,#d#:@d@})}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')@flush@();else @sh@=Date.now()});
addEventListener('pagehide',@flush@);
`,
  String.raw`function @label@(@el@){return((@el@&&(@el@.getAttribute('data-track')||@el@.getAttribute('aria-label')||@el@.innerText||@el@.value||@el@.title))||'').trim().slice(0,80)}
`,
  String.raw`function @where@(@h@){try{var @u@=new URL(@h@,location.href);return @u@.host===location.host?@u@.pathname+@u@.search+@u@.hash:@u@.host+@u@.pathname}catch(@e@){return @h@||''}}
`,
  String.raw`document.addEventListener('click',function(@ev@){var @el@=@ev@.target&&@ev@.target.closest&&@ev@.target.closest('a,button,[data-track],input[type=submit]');if(!@el@)return;
if((@el@.tagName==='BUTTON'&&(@el@.type||'submit')==='submit'&&@el@.form)||(@el@.tagName==='INPUT'&&@el@.form))return;
var @h@=@el@.getAttribute('href')||'',@k@=$link$;
if(@el@.tagName==='A'&&@h@&&!/^(#|javascript:|mailto:|tel:)/i.test(@h@)){try{if(new URL(@h@,location.href).host!==location.host)@k@=$out$}catch(@e@){}}
var @o@={#k#:@k@,#l#:@label@(@el@),#t#:@h@?@where@(@h@):''};
if(@k@===$link$){@o@.#c#=((@el@.getAttribute('class')||'')+' '+(@el@.getAttribute('rel')||'')).slice(0,160);if(@el@.tagName==='BUTTON'||@el@.hasAttribute('data-track'))@o@.#b#=1}
@send@(@o@)},true);
`,
  String.raw`document.addEventListener('submit',function(@ev@){var @f@=@ev@.target;if(!@f@||@f@.tagName!=='FORM')return;var @bt@=@ev@.submitter||@f@.querySelector('button[type=submit],button:not([type]),input[type=submit]');var @a@;try{@a@=new URL(@f@.getAttribute('action')||location.pathname,location.href)}catch(@e@){return}
if(@a@.host!==location.host){@send@({#k#:$out$,#l#:@label@(@bt@),#t#:@a@.host+@a@.pathname});return}
try{sessionStorage.setItem(%SK%,JSON.stringify({@sa@:@a@.pathname,@sf@:location.pathname,@sl@:@label@(@bt@),@sat@:Date.now()}))}catch(@e@){}},true);
`
];
const COUNTER_TAIL = '})();';

const tokenList = (re: RegExp) => [...new Set([...[COUNTER_HEAD, ...COUNTER_BLOCKS].join('').matchAll(re)].map((m) => m[1]))];

/** Заготовка целиком — в таком виде она уходит и в код Worker. */
export const COUNTER_TEMPLATE = {
  head: COUNTER_HEAD,
  blocks: COUNTER_BLOCKS,
  tail: COUNTER_TAIL,
  ids: tokenList(/@([A-Za-z]+)@/g),
  fields: tokenList(/#([a-z]+)#/g),
  kinds: tokenList(/\$([a-z]+)\$/g)
};

/**
 * Сборка варианта счётчика — обычный JavaScript, один и тот же текст работает в
 * панели и в Cloudflare Worker (вставляется в его код как есть). Вариант
 * выводится из 32 байт (SHA-256 от ключа и сайта): свой адрес файла и событий,
 * свои имена, названия полей, виды событий и порядок блоков.
 */
const VARIANT_SRC = String.raw`function counterRng(x) {
  var w = function (i) { return ((x[i] << 24) | (x[i + 1] << 16) | (x[i + 2] << 8) | x[i + 3]) >>> 0; };
  var a = w(0), b = w(4), c = w(8), d = w(12);
  var next = function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    var t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (var i = 0; i < 15; i++) next();
  return next;
}
function buildCounter(tpl, m) {
  var blocks = m.order ? m.order.map(function (i) { return tpl.blocks[i]; }) : tpl.blocks;
  return (tpl.head + blocks.join('') + tpl.tail)
    .replace(/@([A-Za-z]+)@/g, function (_, n) { return m.ids[n] || n; })
    .replace(/#([a-z]+)#/g, function (_, n) { return m.fields[n] || n; })
    .replace(/\$([a-z]+)\$/g, function (_, n) { return JSON.stringify(m.kinds[n] || n); })
    .replace(/%EV%/g, function () { return JSON.stringify(m.events); })
    .replace(/%SK%/g, function () { return JSON.stringify(m.storage); });
}
function makeVariant(bytes, tpl) {
  var rnd = counterRng(bytes);
  var pick = function (s) { return s[Math.floor(rnd() * s.length)]; };
  var LOW = 'abcdefghijklmnopqrstuvwxyz', LET = LOW + LOW.toUpperCase(), DIG = '0123456789';
  var used = { do: 1, if: 1, in: 1 };
  var fresh = function (gen) { for (;;) { var n = gen(); if (!used[n]) { used[n] = 1; return n; } } };
  var word = function (min, max) { var n = min + Math.floor(rnd() * (max - min + 1)), s = pick(LOW); while (s.length < n) s += pick(LOW + DIG); return s; };
  var ids = {}, fields = {}, kinds = {}, back = {}, kback = {};
  tpl.ids.forEach(function (n) { ids[n] = fresh(function () { return pick(LET) + (rnd() < 0.55 ? pick(LET + DIG + '_') : ''); }); });
  ids.G = fresh(function () { return '_' + word(3, 5); });
  tpl.fields.forEach(function (n) { var k = fresh(function () { return word(1, 2); }); fields[n] = k; back[k] = n; });
  tpl.kinds.forEach(function (n) { var k = fresh(function () { return word(1, 3); }); kinds[n] = k; kback[k] = n; });
  var script = '/' + pick(['assets', 'static', 'js', 'lib', 'res', 'media', 'inc', 'build', 'dist', 'files']) + '/' + fresh(function () { return word(6, 9); }) + '.js';
  var events = '/' + pick(['api', 'x', 'q', 'v', 'm', 'i', 'u', 'w', 'data', 'srv']) + '/' + fresh(function () { return word(5, 8); });
  var order = tpl.blocks.map(function (_, i) { return i; });
  for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
  var storage = fresh(function () { return word(4, 8); });
  return { script: script, events: events, back: back, kback: kback,
    js: buildCounter(tpl, { ids: ids, fields: fields, kinds: kinds, events: events, storage: storage, order: order }) };
}
function decodeEvent(v, text) {
  var o, out = {}, has = Object.prototype.hasOwnProperty;
  try { o = JSON.parse(text); } catch (e) { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  for (var key in o) if (has.call(o, key) && has.call(v.back, key)) out[v.back[key]] = o[key];
  if (typeof out.k === 'string' && has.call(v.kback, out.k)) out.k = v.kback[out.k];
  return out.k ? JSON.stringify(out) : null;
}
`;

interface CounterVariant { script: string; events: string; js: string; back: Record<string, string>; kback: Record<string, string> }
const variantLib = new Function(VARIANT_SRC + '\nreturn { buildCounter: buildCounter, makeVariant: makeVariant, decodeEvent: decodeEvent };')() as {
  buildCounter: (tpl: typeof COUNTER_TEMPLATE, m: Record<string, unknown>) => string;
  makeVariant: (bytes: Uint8Array, tpl: typeof COUNTER_TEMPLATE) => CounterVariant;
  decodeEvent: (v: CounterVariant, text: string) => string | null;
};

const VARIANT_SALT = 'gsc-hub-counter\n';

/** Вариант счётчика сайта — тот же, что соберёт Worker с этим ключом в COUNTER_KEY. */
export function counterVariant(host: string, key: string): CounterVariant {
  const seed = createHash('sha256').update(VARIANT_SALT + key + '\n' + normHost(host)).digest();
  return variantLib.makeVariant(new Uint8Array(seed), COUNTER_TEMPLATE);
}

/** Событие от страницы варианта → событие с обычными названиями (как его шлёт Worker). */
export function decodeCounterEvent(v: CounterVariant, body: string): string | null {
  return variantLib.decodeEvent(v, body);
}

/** Код счётчика с обычными именами (для проверок). На сайты уходит только вариант. */
export function pageSnippet(path: string = SITE_PATH): string {
  return variantLib.buildCounter(COUNTER_TEMPLATE, { ids: { G: '__ghc' }, fields: {}, kinds: {}, events: path, storage: '__ghs' });
}

/** Код Cloudflare Worker: подключает счётчик к страницам и пересылает события в панель. */
export function workerScript(panelOrigin: string): string {
  return `// GSC Hub — счётчик просмотров, времени и кнопок для сайта (Cloudflare Worker).
// На сайте меняется только одно: в <head> HTML-страниц добавляется
// <script src="…" defer> — файл с адреса самого сайта (его отдаёт этот Worker),
// поэтому защита сайта (Content-Security-Policy: script-src 'self') его пропускает.
// У каждого сайта свой файл: адрес, имена внутри, названия полей и порядок кода
// Worker выводит из имени сайта и секрета COUNTER_KEY. У двух сайтов файлы не
// совпадают, и без ключа один из другого не вывести. События идут на адрес
// самого сайта, Worker переводит их обратно и пересылает в панель.
// Ключ панели — в секрете Worker COUNTER_KEY (Settings → Variables and Secrets), не в коде.
const PANEL = ${JSON.stringify(panelOrigin + '/c')};
const TPL = ${JSON.stringify(COUNTER_TEMPLATE)};
const SALT = ${JSON.stringify(VARIANT_SALT)};
${VARIANT_SRC}
const VARIANTS = new Map();
async function siteVariant(env, hostname) {
  const host = hostname.toLowerCase().replace(/^www\\./, '').replace(/\\.$/, '');
  let v = VARIANTS.get(host);
  if (!v) {
    const seed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + (env.COUNTER_KEY || '') + '\\n' + host));
    v = makeVariant(new Uint8Array(seed), TPL);
    VARIANTS.set(host, v);
  }
  return v;
}

function forward(env, ctx, request, host, e) {
  if (!env.COUNTER_KEY || !e || e.length > 4000) return;
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
    const v = await siteVariant(env, url.hostname);
    if (url.pathname === v.script) {
      return new Response(v.js, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }
    if (url.pathname === v.events) {
      if (request.method === 'POST') forward(env, ctx, request, url.hostname, decodeEvent(v, await request.text()));
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
          // Страница, где нажали кнопку, — из Referer (если это этот же сайт).
          let from = url.pathname;
          try {
            const ref = new URL(request.headers.get('Referer') || '');
            if (ref.hostname === url.hostname) from = ref.pathname;
          } catch (e) {}
          forward(env, ctx, request, url.hostname, JSON.stringify({ k: 'submit', p: from, l: 'Переход к оплате', t: target }));
        }
      } catch (e) {}
      return res;
    }
    if (request.method !== 'GET' || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;
    return new HTMLRewriter()
      .on('head', { element(el) { el.append('<script src="' + v.script + '" defer></script>', { html: true }); } })
      .transform(res);
  }
};
`;
}
