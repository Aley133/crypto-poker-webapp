// webapp/js/ui_game.js
import { getGameState } from './api.js';

// Извлекаем параметры из URL
const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId = params.get('user_id');

// DOM-элементы
const statusEl = document.getElementById('status');
const playersEl = document.getElementById('players');
const cardsEl   = document.getElementById('cards');
const actionsEl = document.getElementById('actions');

// Устанавливаем статус ожидания
function renderWaiting(count) {
  statusEl.textContent = `Ожидание игроков… (${count}/${MIN_PLAYERS})`;
}

// Рендер состояния игры
function renderGameState(state) {
  // Если игра ещё не стартовала
  if (!state.started) {
    const count = state.players ? state.players.length : 0;
    statusEl.textContent = `Ожидание игроков… (${count}/${MIN_PLAYERS})`;
    return;
  }
  // Иначе показываем раздачу
  statusEl.textContent = `Игра в процессе`;
  // Выводим карты столу
  cardsEl.innerHTML = state.community_cards
    .map(card => `<span class="card">${card}</span>`)
    .join('');
  // Выводим игроков и их стеки
  playersEl.innerHTML = Object.entries(state.stacks)
    .map(([uid, stack]) =>
      `<div class="player${uid===userId? ' self':''}">` +
        `<strong>${uid}</strong>: ${stack}` +
      `</div>`
    ).join('');
  // Подготовка кнопок действий
  actionsEl.innerHTML = '';
  if (state.current_player == userId) {
    ['fold','check','call','bet','raise'].forEach(act => {
      const btn = document.createElement('button');
      btn.textContent = act;
      btn.addEventListener('click', () => sendAction(act));
      actionsEl.appendChild(btn);
    });
  }
}

// Отправка действия
function sendAction(action) {
  const msg = { user_id: userId, action };
  ws.send(JSON.stringify(msg));
}

// WebSocket подключение
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${location.host}/ws/game/${tableId}`);

ws.onopen = () => console.log('WS connected');
ws.onmessage = e => {
  const state = JSON.parse(e.data);
  renderGameState(state);
};
ws.onclose = () => console.log('WS closed');

// Начальное получение состояния через HTTP
(async function init() {
  const state = await getGameState(tableId);
  renderGameState(state);
})();
