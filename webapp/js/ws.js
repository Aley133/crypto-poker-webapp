import { getGameState } from './api.js';

// Утилита для получения параметров из URL
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tableId = getParam('table_id');
const userId  = getParam('user_id');
if (!tableId || !userId) {
  console.error('Missing table_id or user_id in URL');
}

// Без контекстных параметров WS создадим соединение сразу
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(
  `${protocol}://${window.location.host}/ws/game/${tableId}` +
  `?user_id=${encodeURIComponent(userId)}`
);

ws.onopen = () => console.log('WebSocket connected:', tableId);
ws.onmessage = evt => {
  const state = JSON.parse(evt.data);
  // renderGameState должна быть глобально доступна
  if (typeof renderGameState === 'function') {
    renderGameState(state, userId);
  }
};
ws.onclose = () => console.log('WebSocket closed');
ws.onerror = err => console.error('WebSocket error', err);

/**
 * Создаёт WebSocket с параметрами и колбэком onMessage
 */
export function createWebSocket(tableId, userId, username, onMessage) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws/game/${tableId}` +
              `?user_id=${encodeURIComponent(userId)}` +
              `&username=${encodeURIComponent(username)}`;
  const socket = new WebSocket(url);
  socket.onopen    = () => console.log('WS connected');
  socket.onmessage = onMessage;
  socket.onclose   = () => console.log('WS closed');
  socket.onerror   = err => console.error('WS error', err);
  return socket;
}

// Fallback: поллинг через HTTP на случай задержек WS
(async function pollState(){
  try {
    const state = await getGameState(tableId);
    if (typeof renderGameState === 'function') {
      renderGameState(state, userId);
    }
  } catch(e) {
    console.error('Poll error', e);
  }
  setTimeout(pollState, 2000);
})();
