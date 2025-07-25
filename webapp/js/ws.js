import { getGameState } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  window.initData = window.Telegram?.WebApp?.initData || '';
  if (window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready();
  }
});

/**
 * Создаёт и настраивает WebSocket для игры
 * @param {string} tableId
 * @param {string} userId
 * @param {string} username
 * @param {function(MessageEvent):void} onMessage
 * @returns {WebSocket}
 */
export function createWebSocket(tableId, userId, seat, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url =
    `${protocol}://${window.location.host}` +
    `/ws/game/${tableId}/${encodeURIComponent(userId)}/${seat}` +
    `?initData=${encodeURIComponent(window.initData)}`;

  const ws = new WebSocket(url);

  ws.onopen = () => console.log('WebSocket connected to', url);
  ws.onmessage = event => onMessage(event);
  ws.onclose = e => console.log('WebSocket closed', e);
  ws.onerror = e => console.error('WebSocket error', e);

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
