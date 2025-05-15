// webapp/js/ws.js
import { getGameState } from './api.js';

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tableId = getParam('table_id');
const userId  = getParam('user_id');
if (!tableId || !userId) {
  console.error('Missing table_id or user_id in URL');
}

const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${window.location.host}/ws/game/${tableId}`);

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

// Fallback: если WS не успевает, можно подхватывать через HTTP
(async function pollState(){
  try {
    const st = await getGameState(tableId);
    renderGameState(st, userId);
  } catch(e){
    console.error(e);
  }
  setTimeout(pollState, 2000);
})();
