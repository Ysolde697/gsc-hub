import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { listAccounts } from '$lib/server/accounts';
import { signIn } from '../auth';

export const load: PageServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'unauthorized');
  const ownerId = user.role === 'admin' ? undefined : user.id;
  // Токены Google в браузер не отдаём: странице нужны только эти поля.
  const accounts = listAccounts(db(), ownerId).map((a) => ({
    id: a.id,
    email: a.email,
    label: a.label,
    status: a.status,
    last_error: a.last_error,
    added_at: a.added_at,
    owner_id: a.owner_id,
    in_use: a.in_use
  }));
  return { accounts, user };
};

export const actions: Actions = {
  connect: signIn
};
