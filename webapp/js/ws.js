import { getGameState } from './api.js';

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tableId = getParam('table_id');
const userId  = getParam('user_id');
if (!tableId || !userId) {
  console.error('Missing table_id or user_id in URL');
}

// Единственное подключение WebSocket без username
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(
  `${protocol}://${window.location.host}/ws/game/${tableId}`
);

ws.onopen = () => {
  console.log('WebSocket connected:', tableId);
};

ws.onmessage = evt => {
  const state = JSON.parse(evt.data);
  renderGameState(state, userId);
};

ws.onclose = () => {
  console.log('WebSocket closed');
};

ws.onerror = err => {
  console.error('WebSocket error', err);
};

/**
 * Инициализирует WebSocket и возвращает объект ws
 * @param {string} tableId
 * @param {string} userId
 * @param {string} username
 * @param {(event: MessageEvent) => void} onMessage
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

// Fallback: если WS не успевает, можно подхватывать через HTTP
(async function pollState(){
  try {
    const state = await getGameState(tableId);
    renderGameState(state, userId);
  } catch(e){
    console.error('Poll error', e);
  }
  setTimeout(pollState, 2000);
})();
