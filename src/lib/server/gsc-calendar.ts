// Dates, the way Search Console means them.
//
// Its daily rows are keyed to America/Los_Angeles, not UTC. Deriving a date
// from `new Date().toISOString().slice(0, 10)` is therefore wrong for a good
// part of every evening east of the Atlantic: the app asks for a day the data
// does not have yet, and quietly gets less back than it thinks.
//
// Everything here works on plain YYYY-MM-DD strings. Once a date is a string
// rather than an instant, arithmetic on it has no timezone and no DST to drift
// across — which is why `addCalendarDays` does not subtract milliseconds.

const GSC_TIME_ZONE = 'America/Los_Angeles';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: GSC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/** Today's date in Search Console's timezone, as YYYY-MM-DD. */
export function gscToday(now: number = Date.now()): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the API wants.
  return formatter.format(new Date(now));
}

// Часовой пояс владельца панели: «сегодня» на Dashboard — по нему. Германия по
// умолчанию; поменять — переменной окружения DISPLAY_TZ.
export const DISPLAY_TIME_ZONE = process.env.DISPLAY_TZ || 'Europe/Berlin';

/** Сегодняшняя дата в часовом поясе владельца панели, YYYY-MM-DD. */
export function localToday(now: number = Date.now(), tz: string = DISPLAY_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

/** The most recent day that has finished — today is still accumulating. */
export function latestCompleteDay(now: number = Date.now()): string {
  return addCalendarDays(gscToday(now), -1);
}

export function addCalendarDays(date: string, delta: number): string {
  // Anchored at UTC midnight purely as a calendar, never as a wall clock, so
  // the hour a timezone gains or loses cannot move the result.
  const at = Date.parse(`${date}T00:00:00Z`) + delta * 86400_000;
  return new Date(at).toISOString().slice(0, 10);
}

/** How many dates an inclusive range covers. */
export function dateSpan(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.round(ms / 86400_000) + 1;
}

/**
 * A window of exactly `days` completed calendar days ending with the most
 * recent finished one. The single definition of what "last N days" means —
 * anything computing its own dates will disagree with the rest of the app.
 */
export function completedDayRange(
  days: number, now: number = Date.now()
): { startDate: string; endDate: string } {
  const endDate = latestCompleteDay(now);
  return { startDate: addCalendarDays(endDate, -(days - 1)), endDate };
}

/**
 * Во сколько по местному времени Google начнёт сутки `date` (его сутки — по
 * Калифорнии; разница с Германией 8–9 часов в зависимости от перевода часов).
 * Возвращает «HH:MM» или null, если этот день у Google уже начался.
 */
export function gscDayStartsAtLocal(date: string, now: number = Date.now(), tz: string = DISPLAY_TIME_ZONE): string | null {
  if (gscToday(now) >= date) return null;
  // Шагаем по 15 минут вперёд до момента, когда у Google наступит `date` (не дальше суток).
  let t = now - (now % (15 * 60_000));
  for (let i = 0; i < 4 * 26 && gscToday(t) < date; i++) t += 15 * 60_000;
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}
