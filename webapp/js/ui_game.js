import { getGameState } from './api.js';

// Извлечь параметры из URL
const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');

// Константа для отображения
const MIN_PLAYERS = 2;

// DOM-элементы
const statusEl  = document.getElementById('status');
const cardsEl   = document.getElementById('cards');
const playersEl = document.getElementById('players');
const actionsEl = document.getElementById('actions');
const leaveBtn  = document.getElementById('leave-btn');

// Функция рендера состояния игры
function renderGameState(state) {
  // Ожидание игроков
  if (!state.started) {
    const count = state.players_count || 0;
    statusEl.textContent = `Ожидание игроков… (${count}/${MIN_PLAYERS})`;
    return;
  }
  // Игра началась
  statusEl.textContent = 'Игра в процессе';

  // Рендер общих карт
  cardsEl.innerHTML = (state.community_cards || []).
    map(card => `<span class="card">${card}</span>`).
    join('');

  // Рендер игроков и их стеков
  playersEl.innerHTML = Object.entries(state.stacks || {}).map(
    ([uid, stack]) =>
      `<div class="player${uid === userId ? ' self' : ''}">` +
        `<strong>${uid}</strong>: ${stack}` +
      `</div>`
  ).join('');

  // Кнопки действий для текущего игрока
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

// Отправка действия серверу
function sendAction(action) {
  ws.send(JSON.stringify({ user_id: userId, action }));
}

// WebSocket соединение
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${window.location.host}/ws/game/${tableId}`);

ws.onopen = () => console.log('WebSocket connected');
ws.onmessage = e => {
  const state = JSON.parse(e.data);
  renderGameState(state);
};
ws.onclose = () => console.log('WebSocket closed');
ws.onerror = err => console.error('WebSocket error', err);

// Инициализация через HTTP запрос
(async function init() {
  try {
    const state = await getGameState(tableId);
    renderGameState(state);
  } catch (err) {
    console.error('Init error', err);
    statusEl.textContent = 'Ошибка получения состояния';
  }
})();

// Обработчик кнопки «Покинуть стол»
leaveBtn.addEventListener('click', async () => {
  try {
    await fetch(
      `/api/leave?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`,
      { method: 'POST' }
    );
    // Редирект в лобби
    window.location.href = '/index.html';
  } catch (err) {
    console.error('Ошибка при выходе со стола', err);
    alert('Не удалось покинуть стол');
  }
});
