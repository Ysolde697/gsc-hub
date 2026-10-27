import type { LayoutServerLoad } from './$types';
import { appVersion } from '$lib/server/version';
import { db } from '$lib/server/db';
import { listAccounts } from '$lib/server/accounts';

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  depends('app:consoles');
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
      : []
  };
};
