import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { User } from '../models';
import { verifyAccessToken } from '../modules/auth/token.service';
import { lifecycle } from './lifecycle';

export const WS_PATH = '/ws';
const HEARTBEAT_MS = 30_000;

const connections = new Map<string, Set<WebSocket>>();
let wss: WebSocketServer | null = null;

/**
 * Browsers cannot set Authorization on WebSocket requests, so the access token is sent as a
 * subprotocol: `new WebSocket(url, ['bearer', token])`. Query-string tokens are avoided because
 * URLs end up in proxy and access logs.
 */
function tokenFromRequest(req: IncomingMessage): string | null {
  const protocols = (req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim());
  const index = protocols.indexOf('bearer');
  return index >= 0 ? (protocols[index + 1] ?? null) : null;
}

function reject(socket: Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachWebSocketServer(server: Server): void {
  if (!env.WS_ENABLED) return;
  wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    handleProtocols: (protocols) => (protocols.has('bearer') ? 'bearer' : false),
  });

  server.on('upgrade', async (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== WS_PATH) return reject(socket, 404, 'Not Found');
    const token = tokenFromRequest(req);
    if (!token) return reject(socket, 401, 'Unauthorized');
    try {
      const payload = verifyAccessToken(token);
      const user = await User.findByPk(payload.sub);
      if (!user || user.status !== 'active') return reject(socket, 401, 'Unauthorized');
      wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit('connection', ws, req, user.id));
    } catch {
      reject(socket, 401, 'Unauthorized');
    }
  });

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, _req: IncomingMessage, userId: string) => {
    ws.isAlive = true;
    const set = connections.get(userId) ?? new Set();
    set.add(ws);
    connections.set(userId, set);
    ws.send(JSON.stringify({ event: 'connected', data: { userId } }));

    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (raw) => {
      // Minimal protocol: respond to pings; extend with your own events.
      if (Buffer.isBuffer(raw) && raw.toString('utf8') === 'ping') ws.send(JSON.stringify({ event: 'pong' }));
    });
    ws.on('close', () => {
      set.delete(ws);
      if (set.size === 0) connections.delete(userId);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss?.clients ?? []) {
      const socket = ws as WebSocket & { isAlive?: boolean };
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_MS);

  lifecycle.onShutdown('websocket', async () => {
    clearInterval(heartbeat);
    for (const ws of wss?.clients ?? []) ws.close(1001, 'Server shutting down');
    await new Promise<void>((resolve) => wss!.close(() => resolve()));
  });
  logger.info({ path: WS_PATH }, 'websocket server attached');
}

/** Pushes an event to every open connection of a user. No-op when WebSockets are disabled. */
export function notifyUser(userId: string, event: string, data: unknown): void {
  const set = connections.get(userId);
  if (!set) return;
  const message = JSON.stringify({ event, data });
  for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(message);
}
