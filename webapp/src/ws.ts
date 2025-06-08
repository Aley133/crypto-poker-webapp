import { getGameState } from './api';

export function buildWebSocketUrl(
  tableId: string,
  userId: string,
  username: string,
  loc: Location = window.location
): string {
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${loc.host}/ws/game/${tableId}` +
         `?user_id=${encodeURIComponent(userId)}` +
         `&username=${encodeURIComponent(username)}`;
}

export function createWebSocket(
  tableId: string,
  userId: string,
  username: string,
  onMessage: (ev: MessageEvent) => void
): WebSocket {
  const url = buildWebSocketUrl(tableId, userId, username);
  const ws = new WebSocket(url);

  ws.onopen = () => console.log('WebSocket connected to', url);
  ws.onmessage = event => onMessage(event);
  ws.onclose = e => console.log('WebSocket closed', e);
  ws.onerror = e => console.error('WebSocket error', e);
  return ws;
}

export function startPolling(
  tableId: string,
  userId: string,
  onState: (ev: MessageEvent) => void
) {
  async function poll() {
    try {
      const state = await getGameState(tableId);
      onState({ data: JSON.stringify(state) } as MessageEvent);
    } catch (e) {
      console.error('Poll error', e);
    }
    setTimeout(poll, 2000);
  }
  poll();
}
