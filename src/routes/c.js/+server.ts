import type { RequestHandler } from './$types';
import { counterScript } from '$lib/server/button-clicks';

// Скрипт счётчика для ваших сайтов. Адрес отправки — этот же сервер.
export const GET: RequestHandler = ({ url }) =>
  new Response(counterScript(url.origin), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
