import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// MCP с ключом в адресе (/api/v1/mcp/k/<ключ>) для коннектора claude.ai.
describe('MCP: ключ в адресе', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-hub-'));
    process.env.DB_PATH = join(dir, 't.db');
    process.env.SERP_API_TOKEN = 'secret-key';
  });
  afterEach(() => {
    delete process.env.SERP_API_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  });

  const event = (key: string, init?: RequestInit) =>
    ({ request: new Request('http://x/api/v1/mcp/k/' + key, init), params: { key } }) as never;

  it('пускает с верным ключом и отвечает на initialize', async () => {
    const { GET, POST } = await import('../src/routes/api/v1/mcp/k/[key]/+server');
    const g = await GET(event('secret-key'));
    expect(g.status).toBe(200);
    const p = await POST(
      event('secret-key', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      })
    );
    const body = await p.json();
    expect(body.result.serverInfo).toBeTruthy();
  });

  it('не пускает с неверным ключом', async () => {
    const { GET } = await import('../src/routes/api/v1/mcp/k/[key]/+server');
    await expect(async () => GET(event('wrong'))).rejects.toMatchObject({ status: 401 });
  });
});
