import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guard';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return {};
};
