import { getGameState } from './api.js';

/**
 * Создаёт и настраивает WebSocket для игры
 * @param {string} tableId
 * @param {string} userId
 * @param {string} username
 * @param {function(MessageEvent):void} onMessage
 * @returns {WebSocket}
 */
export function createWebSocket(tableId, userId, username, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws/game/${tableId}` +
              `?user_id=${encodeURIComponent(userId)}` +
              `&username=${encodeURIComponent(username)}`;

  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected to', url);
  };

  ws.onmessage = event => {
    onMessage(event);
  };

  ws.onclose = event => {
    console.log('WebSocket closed', event);
    // При желании можно переключиться на HTTP-поллинг:
    // startPolling(tableId, userId, data => onMessage({ data: JSON.stringify(data) }));
  };

  ws.onerror = err => {
    console.error('WebSocket error', err);
  };

  return ws;
}

// Fallback-поллинг через HTTP: обновление состояния каждые 2 секунды
export function startPolling(tableId, userId, onState) {
  async function poll() {
    try {
      const state = await getGameState(tableId);
      onState({ data: JSON.stringify(state) });
    } catch (e) {
      console.error('Poll error', e);
    }
    setTimeout(poll, 2000);
  }
  poll();
}
