// ui_game.js

import { connectWS, startPolling, stopPolling } from './ws.js';
import { leaveTable, startHand } from './api.js';

let socket, tableId, userId, username;

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

export function initGame() {
  tableId = parseInt(getParam('table_id'));
  userId = getParam('user_id') || localStorage.getItem('user_id');
  username = getParam('username') || localStorage.getItem('username');

  // UI: кнопка Leave
  document.getElementById('leave-btn').onclick = async () => {
    await leaveTable(tableId, userId);
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    stopPolling();
    window.location.href = 'index.html';
  };

  // UI: кнопка Start Hand (хозяину стола)
  document.getElementById('start-hand-btn').onclick = () => {
    startHand(tableId);
  };

  const onState = renderGameState;
  const onError = () => {
    console.warn('WS failed — start polling');
    startPolling(tableId, userId, onState);
  };

  // Подключаем WS
  socket = connectWS(tableId, userId, onState, onError);
}

function renderGameState(state) {
  stopPolling();
  // отрисуйте свои элементы: hole, community, players и т.д.
  // например:
  document.getElementById('my-cards').textContent = state.your_hole.join(', ');
  // ...
}
