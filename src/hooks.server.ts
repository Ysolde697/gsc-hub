import { building } from '$app/environment';
import { startBacklinkMonitor } from '$lib/server/backlink-monitor';
import { startUptimeMonitor } from '$lib/server/uptime';
import { db } from '$lib/server/db';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authHandle } from './auth';
import { authGuard } from '$lib/server/guard';

export const handle = sequence(authGuard, authHandle);

export const init = () => {
  if (!building) {
    startBacklinkMonitor();
    startUptimeMonitor(db);
  }
};
