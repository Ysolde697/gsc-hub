import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * На время запроса: кто вошёл и (если страница так решила) период отчётов из
 * шапки — тогда все «последние N дней» в запросах к Google берут эти даты.
 */
export const als = new AsyncLocalStorage<{ userId: string | null; range?: { startDate: string; endDate: string; days: number } }>();
