import { getGameState } from './api.js';

// Извлекаем параметры из URL
const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');
const username = params.get('username') || userId;

// Константы
const MIN_PLAYERS = 2;

// DOM-элементы
const statusEl         = document.getElementById('status');
const tableIdEl        = document.getElementById('table-id');
const communityEl      = document.getElementById('community-cards');
const playersEl        = document.getElementById('players');
const controlsEl       = document.getElementById('controls');
const betInput         = document.getElementById('bet-amount');
const leaveBtn         = document.getElementById('leave-btn');
const potEl            = document.getElementById('pot');
const currentBetEl     = document.getElementById('current-bet');

// Устанавливаем ID стола
if (tableIdEl) tableIdEl.textContent = tableId;

let ws;

/**
 * Устанавливаем WebSocket-соединение и хендлеры
 */
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(
    `${protocol}://${window.location.host}/ws/game/${tableId}` +
    `?user_id=${encodeURIComponent(userId)}` +
    `&username=${encodeURIComponent(username)}`
  );

  ws.addEventListener('open', () => console.log('WebSocket connected'));
  ws.addEventListener('message', e => {
    const state = JSON.parse(e.data);
    renderGameState(state);
  });
  ws.addEventListener('close', () => console.log('WebSocket closed'));
  ws.addEventListener('error', err => console.error('WebSocket error', err));
}

/**
 * Рендер состояния игры на странице
 */
function renderGameState(state) {
  // Ожидание старта
  if (!state.started) {
    const count = state.players_count || 0;
    statusEl.textContent = `Ожидаем игроков… (${count}/${MIN_PLAYERS})`;
    controlsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    controlsEl.style.display = 'block';
  }

  // Отображаем общие карты
  communityEl.innerHTML = (state.community_cards || [])
    .map(card => `<span class="card">${card}</span>`)
    .join('');

  // Отображаем пот и текущую ставку, если есть
  if (potEl) potEl.textContent = `Пот: ${state.pot || 0}`;
  if (currentBetEl) currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Рендер списка игроков
  playersEl.innerHTML = '';
  (state.players || []).forEach(p => {
    const div = document.createElement('div');
    div.className = `player-card${p.user_id === userId ? ' self' : ''}`;
    const stack = state.stacks?.[p.user_id] ?? 0;
    const bet   = state.bets?.[p.user_id] ?? 0;
    div.innerHTML = `
      <div class="player-name">${p.username}</div>
      <div class="player-stack">Stack: ${stack}</div>
      <div class="player-bet">Bet: ${bet}</div>
    `;
    playersEl.appendChild(div);
  });
}

// Обработка кликов по кнопкам действий
controlsEl.addEventListener('click', e => {
  if (e.target.tagName !== 'BUTTON') return;
  const action = e.target.dataset.action;
  let amount = 0;
  if (['bet', 'raise'].includes(action)) {
    amount = parseInt(betInput.value) || 0;
  }
  ws.send(JSON.stringify({ user_id: userId, action, amount }));
});

// Кнопка «Покинуть стол»
leaveBtn.addEventListener('click', async () => {
  try {
    await fetch(
      `/api/leave?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`,
      { method: 'POST' }
    );
    window.location.href = '/index.html';
  } catch (err) {
    console.error('Ошибка при выходе со стола', err);
    alert('Не удалось покинуть стол');
  }
});

// Инициализация: получаем начальное состояние и подключаем WS
(async function init() {
  try {
    const state = await getGameState(tableId);
    renderGameState(state);
  } catch (err) {
    console.error('Init error', err);
    statusEl.textContent = 'Ошибка получения состояния';
  }
  connectWebSocket();
})();
