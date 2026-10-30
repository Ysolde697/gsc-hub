// Один период на все отчёты: выбирается в шапке, свой у каждого пользователя.
// Страница вызывает reportPeriod() — и все «последние N дней» в запросах к
// Google в этом запросе берут именно эти даты (см. gscDateRange в google.ts).
import type { Db } from './db';
import { als } from './request-context';
import { parsePeriod, type Period } from './site-keys';
import { userPeriodKey } from './user-selection';

export const DEFAULT_PERIOD = '28';

export function reportPeriod(db: Db, opts: { includeToday?: boolean; minDays?: number } = {}): Period {
  let p = parsePeriod(userPeriodKey(db) ?? DEFAULT_PERIOD, Date.now(), opts);
  // Графикам нужно несколько дней: короче minDays — показываем minDays.
  if (opts.minDays && p.days < opts.minDays) p = parsePeriod(String(opts.minDays), Date.now(), opts);
  const store = als.getStore();
  if (store) store.range = { startDate: p.startDate, endDate: p.endDate, days: p.days };
  return p;
}
