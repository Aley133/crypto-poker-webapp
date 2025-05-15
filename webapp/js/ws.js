import { getGameState } from './api.js';

/**
 * Создаёт и настраивает WebSocket для игры
 */
export function createWebSocket(tableId, userId, username, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws/game/${tableId}` +
              `?user_id=${encodeURIComponent(userId)}` +
              `&username=${encodeURIComponent(username)}`;
}

/**
 * Поллинг через HTTP, если WS недоступен
 */
export function startPolling(tableId, userId, onState) {
  async function poll() {
    try {
      const state = await getGameState(tableId);
      onState(state);
    } catch (e) {
      console.error('Poll error', e);
    }
    setTimeout(poll, 2000);
  }
  poll();
}
