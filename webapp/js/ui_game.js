import { getGameState } from './api.js';

// Извлекаем параметры из URL
const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');
const username = params.get('username') || userId;

// Минимальное число игроков для старта
const MIN_PLAYERS = 2;

// DOM-элементы (должны быть в game.html)
const statusEl   = document.getElementById('status');
const cardsEl    = document.getElementById('cards');
const playersEl  = document.getElementById('players');
const actionsEl  = document.getElementById('actions');
const leaveBtn   = document.getElementById('leave-btn');

let ws;

/**
 * Устанавливаем WebSocket и хендлеры сообщений
 */
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${window.location.host}/ws/game/${tableId}` +
              `?user_id=${encodeURIComponent(userId)}` +
              `&username=${encodeURIComponent(username)}`;

  ws = new WebSocket(url);
  ws.onopen = () => console.log('WS connected');
  ws.onmessage = e => renderGameState(JSON.parse(e.data));
  ws.onclose = () => console.log('WS closed');
  ws.onerror = err => console.error('WS error', err);
}

/**
 * Рендерим состояние игры
 */
function renderGameState(state) {
  // Ожидание игроков
  if (!state.started) {
    const count = state.players_count || 0;
    statusEl.textContent = `Ожидание игроков… (${count}/${MIN_PLAYERS})`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'block';
  }

  // Общие карты
  cardsEl.innerHTML = (state.community_cards || [])
    .map(card => `<span class="card">${card}</span>`)
    .join('');

  // Список игроков
  playersEl.innerHTML = '';
  (state.players || []).forEach(p => {
    const isSelf = p.user_id === userId;
    const div = document.createElement('div');
    div.className = `player${isSelf ? ' self' : ''}`;
    const stack = state.stacks?.[p.user_id] ?? 0;
    const bet   = state.bets?.[p.user_id] ?? 0;
    div.innerHTML = `
      <strong>${p.username}</strong> — Стек: ${stack} | Ставка: ${bet}
    `;
    playersEl.appendChild(div);
  });

  // Действия текущего игрока
  actionsEl.innerHTML = '';
  if (state.current_player == userId) {
    ['fold','check','call','bet','raise'].forEach(act => {
      const btn = document.createElement('button');
      btn.textContent = act;
      btn.dataset.action = act;
      btn.addEventListener('click', () => {
        let amount = 0;
        if (act === 'bet' || act === 'raise') {
          amount = parseInt(prompt('Введите сумму')) || 0;
        }
        ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
      });
      actionsEl.appendChild(btn);
    });
  }
}

// Кнопка выхода со стола
leaveBtn.addEventListener('click', async () => {
  try {
    await fetch(
      `/api/leave?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`,
      { method: 'POST' }
    );
    window.location.href = '/index.html';
  } catch (err) {
    console.error('Leave error', err);
    alert('Не удалось покинуть стол');
  }
});

// Инициализация: получаем состояние и подключаем WS
(async () => {
  try {
    const state = await getGameState(tableId);
    renderGameState(state);
  } catch (err) {
    console.error('Init error', err);
    statusEl.textContent = 'Ошибка получения состояния';
  }
  connectWebSocket();
})();
