import type { RequestHandler } from './$types';
import { POST as mcpPost, GET as mcpGet } from '../../+server';

// Тот же MCP, но ключ в адресе: /api/v1/mcp/k/<ключ>. Нужен для коннектора
// claude.ai — туда вставляется только URL, без заголовков. Ключ из пути
// превращается в Authorization: Bearer, дальше всё как у обычного /api/v1/mcp.
function withKey(request: Request, key: string): Request {
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${key}`);
  return new Request(request, { headers });
}

export const POST: RequestHandler = (event) =>
  mcpPost({ ...event, request: withKey(event.request, event.params.key) } as never);

export const GET: RequestHandler = (event) =>
  mcpGet({ ...event, request: withKey(event.request, event.params.key) } as never);
