/** Behavioral tests for WebSocket upgrade handling.
 *
 * Verifies that:
 * - Valid /ws/session/:id paths accept WebSocket upgrades
 * - Invalid paths are rejected (socket destroyed)
 * - Only one upgrade handler processes each connection (noServer: true)
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

function createTestServer() {
  const connections: { sessionId: string; ws: WebSocket }[] = [];
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/session\/(.+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      connections.push({ sessionId: match[1], ws });
    });
  });

  return { server, wss, connections };
}

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

function connectWs(port: number, path: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

describe('WebSocket upgrade handler', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('accepts connections on /ws/session/:id', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);

    const ws = await connectWs(port, '/ws/session/abc-123');
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(ctx.connections).toHaveLength(1);
    expect(ctx.connections[0].sessionId).toBe('abc-123');
    ws.close();
  });

  it('rejects connections on invalid paths', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);

    await expect(connectWs(port, '/invalid')).rejects.toThrow();
    expect(ctx.connections).toHaveLength(0);
  });

  it('handles multiple concurrent sessions', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);

    const ws1 = await connectWs(port, '/ws/session/sess-1');
    const ws2 = await connectWs(port, '/ws/session/sess-2');
    expect(ctx.connections).toHaveLength(2);
    expect(ctx.connections.map((c) => c.sessionId)).toEqual(['sess-1', 'sess-2']);
    ws1.close();
    ws2.close();
  });

  it('does not produce duplicate connections per upgrade (noServer: true)', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);

    // With the old { server, path: undefined } config, this would register
    // two upgrade handlers, causing duplicate or corrupted connections.
    // With noServer: true, only our manual handler runs.
    const ws = await connectWs(port, '/ws/session/test-dup');
    expect(ctx.connections).toHaveLength(1);
    ws.close();
  });
});
