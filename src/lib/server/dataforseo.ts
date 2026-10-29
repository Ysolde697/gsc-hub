// DataForSEO: точная частотность ключа от Google Ads, вручную по кнопке.
// Логин и пароль API хранятся только на сервере (раздел «Сервисы»).
// Каждый ответ сохраняется в keyword_volumes — повторно за ключ не платим.
import type { Db } from './db';
import { getConfigValue } from './config';

const BASE = 'https://api.dataforseo.com/v3';
/** Лимиты Google Ads для ключа: до 80 символов и до 10 слов. */
const MAX_LEN = 80;
const MAX_WORDS = 10;
const BATCH = 1000;

export const volumeKey = (q: string) => q.toLowerCase().replace(/\s+/g, ' ').trim();

export function dataForSeoConfigured(db: Db): boolean {
  return !!getConfigValue(db, 'DATAFORSEO_LOGIN') && !!getConfigValue(db, 'DATAFORSEO_PASSWORD');
}

function auth(db: Db): string {
  const login = getConfigValue(db, 'DATAFORSEO_LOGIN');
  const pass = getConfigValue(db, 'DATAFORSEO_PASSWORD');
  if (!login || !pass) throw new Error('DataForSEO не настроен: впишите логин и пароль API в разделе «Сервисы»');
  return 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64');
}

type Fetch = typeof fetch;

async function call(db: Db, path: string, body: unknown, f: Fetch): Promise<any> {
  const res = await f(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: auth(db), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ниже — общая ошибка */
  }
  if (!res.ok || !json || json.status_code !== 20000) {
    const msg = json?.status_message || text.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(res.status === 401 ? 'DataForSEO: неверный логин или пароль API' : `DataForSEO: ${msg}`);
  }
  return json;
}

/** Баланс аккаунта, $ — для кнопки «Проверить доступ». */
export async function dataForSeoBalance(db: Db, f: Fetch = fetch): Promise<number> {
  const j = await call(db, '/appendix/user_data', undefined, f);
  return Number(j.tasks?.[0]?.result?.[0]?.money?.balance ?? 0);
}

/** Сохранённые значения: ключ → частотность (null — у Google нет данных). */
export function cachedVolumes(db: Db, queries: string[], location: number): Map<string, { volume: number | null; at: number }> {
  const out = new Map<string, { volume: number | null; at: number }>();
  const st = db.prepare('SELECT volume, fetched_at FROM keyword_volumes WHERE query = ? AND location = ?');
  for (const q of queries) {
    const r = st.get(volumeKey(q), location) as { volume: number | null; fetched_at: number } | undefined;
    if (r) out.set(volumeKey(q), { volume: r.volume, at: r.fetched_at });
  }
  return out;
}

/** Годится ли ключ для Google Ads (иначе DataForSEO отклонит всю пачку). */
export function volumeEligible(q: string): boolean {
  const k = volumeKey(q);
  return k.length > 0 && k.length <= MAX_LEN && k.split(' ').length <= MAX_WORDS && !/[!@%^()=\[\]{};~`<>?\\|]/.test(k) && !/^https?:/.test(k);
}

/**
 * Запросить частотность у DataForSEO только для ключей, которых ещё нет в базе.
 * Возвращает, сколько ключей отправлено и сколько это стоило ($).
 */
export async function fetchVolumes(
  db: Db,
  queries: string[],
  location: number,
  f: Fetch = fetch
): Promise<{ requested: number; skipped: number; cost: number }> {
  const have = cachedVolumes(db, queries, location);
  const uniq = [...new Set(queries.map(volumeKey))];
  const todo = uniq.filter((q) => !have.has(q) && volumeEligible(q));
  const skipped = uniq.filter((q) => !volumeEligible(q)).length;
  let cost = 0;
  const save = db.prepare(
    'INSERT INTO keyword_volumes (query, location, volume, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(query, location) DO UPDATE SET volume = excluded.volume, fetched_at = excluded.fetched_at'
  );
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const j = await call(db, '/keywords_data/google_ads/search_volume/live', [{ keywords: part, location_code: location }], f);
    cost += Number(j.cost ?? 0);
    const task = j.tasks?.[0];
    if (task && task.status_code !== 20000) throw new Error(`DataForSEO: ${task.status_message}`);
    const got = new Map<string, number | null>();
    for (const r of task?.result ?? []) if (r?.keyword) got.set(volumeKey(r.keyword), r.search_volume ?? null);
    const now = Date.now();
    db.transaction(() => {
      for (const q of part) save.run(q, location, got.has(q) ? got.get(q) : null, now);
    })();
  }
  return { requested: todo.length, skipped, cost };
}
