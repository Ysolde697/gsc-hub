import type { LayoutServerLoad } from './$types';
import { appVersion } from '$lib/server/version';
import { db } from '$lib/server/db';
import { listAccounts } from '$lib/server/accounts';
import { listSiteGroups } from '$lib/server/site-groups';
import { errorCount } from '$lib/server/uptime';
import { userPeriodKey } from '$lib/server/user-selection';
import { DEFAULT_PERIOD } from '$lib/server/report-period';
import { parsePeriod } from '$lib/server/site-keys';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  depends('app:consoles');
  depends('app:period');
  const isAdmin = locals.user?.role === 'admin';
  return {
    user: locals.user,
    version: appVersion,
    // Opt-out for a public self-host that does not want its visitors' browsers
    // talking to github.com. Anything other than the exact 'off' keeps it on.
    updateCheck: process.env.UPDATE_CHECK !== 'off',
    // Переключатель консолей в шапке. Только для админа: менеджер видит свои
    // аккаунты на странице Accounts, а общие отчёты ему недоступны.
    consoles: isAdmin
      ? listAccounts(db()).map((a) => ({
          id: a.id,
          email: a.email,
          label: a.label,
          status: a.status,
          inUse: a.in_use !== 0
        }))
      : [],
    // Сколько сайтов сейчас с ошибкой доступности — число у пункта меню.
    uptimeErrors: isAdmin ? errorCount(db()) : 0,
    // Период отчётов из шапки — один на всю панель.
    period: isAdmin ? parsePeriod(userPeriodKey(db()) ?? DEFAULT_PERIOD) : null,
    siteGroups: isAdmin
      ? listSiteGroups(db()).map((g) => ({ id: g.id, name: g.name, active: g.active, size: g.hosts.length }))
      : []
  };
};
