// Даты домена: когда зарегистрирован и до какого числа оплачен. Берём из
// открытого реестра доменов (RDAP; адрес реестра зоны — из списка IANA).
// Часть зон (.de, .es, .eu, .it, .at…) даты не публикует — их можно вписать
// вручную на странице «Доступность»; вписанное важнее данных реестра.
import type { Db } from './db';
import { mapSettledLimit } from './concurrency';
import { localToday } from './gsc-calendar';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const STALE_MS = 7 * 24 * 3600_000;
const TIMEOUT_MS = 15_000;

export interface DomainDates {
  host: string;
  /** YYYY-MM-DD или null. */
  registered: string | null;
  expires: string | null;
  /** Откуда даты: реестр или вписаны вручную (по каждой дате отдельно). */
  registeredManual: boolean;
  expiresManual: boolean;
  /** Почему реестр не дал дат: 'no-rdap' — зона их не публикует. */
  error: string | null;
  checkedAt: number;
}

interface Row {
  host: string;
  registered: string | null;
  expires: string | null;
  manual_registered: string | null;
  manual_expires: string | null;
  error: string | null;
  checked_at: number;
}

export function listDomainDates(db: Db): Map<string, DomainDates> {
  const rows = db.prepare('SELECT * FROM domain_dates').all() as Row[];
  return new Map(
    rows.map((r) => [
      r.host,
      {
        host: r.host,
        registered: r.manual_registered ?? r.registered,
        expires: r.manual_expires ?? r.expires,
        registeredManual: r.manual_registered !== null,
        expiresManual: r.manual_expires !== null,
        error: r.error,
        checkedAt: r.checked_at
      }
    ])
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Вписать даты вручную; пустое значение — снова брать из реестра. */
export function setManualDates(db: Db, host: string, registered: string | null, expires: string | null): void {
  const reg = registered && DATE.test(registered) ? registered : null;
  const exp = expires && DATE.test(expires) ? expires : null;
  db.prepare(
    `INSERT INTO domain_dates (host, manual_registered, manual_expires, checked_at) VALUES (?, ?, ?, 0)
     ON CONFLICT(host) DO UPDATE SET manual_registered = excluded.manual_registered, manual_expires = excluded.manual_expires`
  ).run(host, reg, exp);
}

// ─── Реестр ─────────────────────────────────────────────────────────────────

let bootstrap: { at: number; map: Map<string, string> } | null = null;

async function rdapBase(tld: string): Promise<string | null> {
  if (!bootstrap || Date.now() - bootstrap.at > 24 * 3600_000) {
    const res = await fetch(BOOTSTRAP_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`IANA ${res.status}`);
    const json = (await res.json()) as { services: [string[], string[]][] };
    const map = new Map<string, string>();
    for (const [tlds, urls] of json.services) for (const t of tlds) if (urls[0]) map.set(t.toLowerCase(), urls[0]);
    bootstrap = { at: Date.now(), map };
  }
  return bootstrap.map.get(tld) ?? null;
}

/** Для тестов: забыть список реестров. */
export function resetRdapBootstrap(): void {
  bootstrap = null;
}

/** Даты из ответа RDAP: события registration и expiration. */
export function parseRdapDates(json: unknown): { registered: string | null; expires: string | null } {
  const events = (json as { events?: { eventAction?: string; eventDate?: string }[] })?.events ?? [];
  const pick = (action: string) => {
    const d = events.find((e) => e.eventAction === action)?.eventDate ?? '';
    return DATE.test(d.slice(0, 10)) ? d.slice(0, 10) : null;
  };
  return { registered: pick('registration'), expires: pick('expiration') };
}

/** Кандидаты в зарегистрированный домен: blog.site.co.uk → site.co.uk → co.uk. */
export function domainCandidates(host: string): string[] {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) out.push(labels.slice(i).join('.'));
  return out;
}

export async function lookupDomain(host: string): Promise<{ registered: string | null; expires: string | null; error: string | null }> {
  const cands = domainCandidates(host);
  if (!cands.length) return { registered: null, expires: null, error: 'bad-host' };
  const base = await rdapBase(cands[0].split('.').pop()!);
  if (!base) return { registered: null, expires: null, error: 'no-rdap' };
  for (const d of cands) {
    const res = await fetch(base.replace(/\/?$/, '/') + 'domain/' + d, {
      headers: { Accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.status === 404) continue;
    if (!res.ok) return { registered: null, expires: null, error: `rdap ${res.status}` };
    return { ...parseRdapDates(await res.json()), error: null };
  }
  return { registered: null, expires: null, error: 'not-found' };
}

/** Обновить даты доменов, у которых они старше недели (или все, если force). */
export async function refreshDomainDates(db: Db, hosts: string[], opts: { force?: boolean } = {}): Promise<number> {
  const checked = new Map(
    (db.prepare('SELECT host, checked_at FROM domain_dates').all() as { host: string; checked_at: number }[]).map((r) => [r.host, r.checked_at])
  );
  const due = hosts.filter((h) => opts.force || Date.now() - (checked.get(h) ?? 0) >= STALE_MS);
  const save = db.prepare(
    `INSERT INTO domain_dates (host, registered, expires, error, checked_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET registered = excluded.registered, expires = excluded.expires, error = excluded.error, checked_at = excluded.checked_at`
  );
  // Реестр или сеть временно не ответили: прежние даты не трогаем, повторим через час.
  const failed = db.prepare(
    `INSERT INTO domain_dates (host, error, checked_at) VALUES (?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET error = excluded.error, checked_at = excluded.checked_at`
  );
  const retrySoon = () => Date.now() - STALE_MS + 3600_000;
  await mapSettledLimit(
    due,
    async (h) => {
      try {
        const r = await lookupDomain(h);
        if (r.error && r.error.startsWith('rdap ')) failed.run(h, r.error, retrySoon());
        else save.run(h, r.registered, r.expires, r.error, Date.now());
      } catch (e) {
        failed.run(h, `fetch: ${(e as Error).message.slice(0, 80)}`, retrySoon());
      }
    },
    3
  );
  return due.length;
}

let refreshing: Promise<number> | null = null;
/** Фоновое обновление без повторного запуска, пока идёт прошлое. */
export function refreshDomainDatesInBackground(db: Db, hosts: string[]): void {
  if (refreshing) return;
  refreshing = refreshDomainDates(db, hosts)
    .catch(() => 0)
    .finally(() => (refreshing = null));
}

/** Сколько календарных дней (по Германии) до даты YYYY-MM-DD; отрицательное — уже прошла. */
export function daysUntil(date: string, now: number = Date.now()): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localToday(now)}T00:00:00Z`)) / 86400_000);
}
