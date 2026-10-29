import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAdmin } from '$lib/server/guard';
import { getConfigValue, configSource, setConfigValue, clearConfigValue } from '$lib/server/config';
import { indexBalance } from '$lib/server/neuralindexer';
import { dataForSeoBalance } from '$lib/server/dataforseo';
export const load: PageServerLoad = ({ locals }) => {
  requireAdmin(locals);
  return {
    configured: !!getConfigValue(db(), 'NEURALINDEXER_API_TOKEN'),
    source: configSource(db(), 'NEURALINDEXER_API_TOKEN'),
    dfs: {
      configured: !!getConfigValue(db(), 'DATAFORSEO_LOGIN') && !!getConfigValue(db(), 'DATAFORSEO_PASSWORD'),
      login: getConfigValue(db(), 'DATAFORSEO_LOGIN') ?? '',
      env: configSource(db(), 'DATAFORSEO_LOGIN') === 'env' || configSource(db(), 'DATAFORSEO_PASSWORD') === 'env'
    }
  };
};
export const actions: Actions = {
  save: async ({ locals, request }) => {
    requireAdmin(locals);
    if (configSource(db(), 'NEURALINDEXER_API_TOKEN') === 'env') return fail(400, { error: 'Ключ задан в окружении сервера' });
    const form = await request.formData();
    const token = String(form.get('token') ?? '').trim();
    if (!token || token.length > 512 || /\s/.test(token)) return fail(400, { error: 'Укажи API-ключ без пробелов' });
    setConfigValue(db(), 'NEURALINDEXER_API_TOKEN', token);
    return { saved: true };
  },
  clear: ({ locals }) => {
    requireAdmin(locals);
    if (configSource(db(), 'NEURALINDEXER_API_TOKEN') === 'env') return fail(400, { error: 'Ключ задан в окружении сервера' });
    clearConfigValue(db(), 'NEURALINDEXER_API_TOKEN');
    return { saved: true };
  },
  test: async ({ locals }) => {
    requireAdmin(locals);
    try { const b = await indexBalance(db(), true); return { balance: b.balance_usd }; }
    catch(e) { return fail(400, { error: (e as Error).message }); }
  },
  dfsSave: async ({ locals, request }) => {
    requireAdmin(locals);
    if (configSource(db(), 'DATAFORSEO_LOGIN') === 'env') return fail(400, { dfsError: 'Доступ задан в окружении сервера' });
    const form = await request.formData();
    const login = String(form.get('login') ?? '').trim();
    const password = String(form.get('password') ?? '').trim();
    if (!login || login.length > 256 || /\s/.test(login)) return fail(400, { dfsError: 'Укажи логин API (обычно это email)' });
    if (!password || password.length > 256 || /\s/.test(password)) return fail(400, { dfsError: 'Укажи пароль API без пробелов' });
    setConfigValue(db(), 'DATAFORSEO_LOGIN', login);
    setConfigValue(db(), 'DATAFORSEO_PASSWORD', password);
    return { dfsSaved: true };
  },
  dfsClear: ({ locals }) => {
    requireAdmin(locals);
    if (configSource(db(), 'DATAFORSEO_LOGIN') === 'env') return fail(400, { dfsError: 'Доступ задан в окружении сервера' });
    clearConfigValue(db(), 'DATAFORSEO_LOGIN');
    clearConfigValue(db(), 'DATAFORSEO_PASSWORD');
    return { dfsSaved: true };
  },
  dfsTest: async ({ locals }) => {
    requireAdmin(locals);
    try { return { dfsBalance: await dataForSeoBalance(db()) }; }
    catch (e) { return fail(400, { dfsError: (e as Error).message }); }
  }
};
