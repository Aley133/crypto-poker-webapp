import { getGameState } from './api.js';

// URL-параметры
const params    = new URLSearchParams(window.location.search);
const tableId   = params.get('table_id');
const userId    = params.get('user_id');
const username  = params.get('username') || userId;

// Минимальное число игроков
const MIN_PLAYERS = 2;

// DOM-элементы
const tableIdEl      = document.getElementById('table-id');
const statusEl       = document.getElementById('status');
const holeCardsEl    = document.getElementById('hole-cards');
const communityEl    = document.getElementById('community-cards');
const potEl          = document.getElementById('pot');
const currentBetEl   = document.getElementById('current-bet');
const playersEl      = document.getElementById('players');
const actionsEl      = document.getElementById('actions');
const leaveBtn       = document.getElementById('leave-btn');

// Отображаем номер стола
if (tableIdEl) tableIdEl.textContent = tableId;

let ws;

// Устанавливаем WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.host}/ws/game/${tableId}` +
                `?user_id=${encodeURIComponent(userId)}` +
                `&username=${encodeURIComponent(username)}`;
  ws = new WebSocket(wsUrl);
  ws.onmessage = e => renderGameState(JSON.parse(e.data));
  ws.onopen    = () => console.log('WS connected');
  ws.onclose   = () => console.log('WS closed');
  ws.onerror   = err => console.error('WS error', err);
}

// Рендерим состояние игры
function renderGameState(state) {
  // Обновляем статус
  if (!state.started) {
    const cnt = state.players_count || 0;
    statusEl.textContent = `Ожидаем игроков… (${cnt}/${MIN_PLAYERS})`;
  } else {
    statusEl.textContent = 'Игра началась';
  }

  // Ваши карты
  const hole = state.hole_cards?.[userId] || [];
  holeCardsEl.innerHTML = hole.map(c => `<span class="card">${c}</span>`).join('');

  // Общие карты
  const community = state.community_cards || state.community || [];
  communityEl.innerHTML = community.map(c => `<span class="card">${c}</span>`).join('');

  // Пот и текущая ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || state.currentBet || 0}`;

  // Рендер списка игроков
  playersEl.innerHTML = '';
  (state.players || []).forEach(p => {
    const div = document.createElement('div');
    div.className = `player-card${p.user_id == userId ? ' self' : ''}`;
    const stack = state.stacks?.[p.user_id] ?? 0;
    const bet   = state.bets?.[p.user_id] ?? state.current_bet ?? 0;
    div.innerHTML = `
      <div class="player-name">${p.username}</div>
      <div class="player-stack">Stack: ${stack}</div>
      <div class="player-bet">Bet: ${bet}</div>
    `;
    playersEl.appendChild(div);
  });

  // Всегда показываем контролы действий
  actionsEl.style.display = 'block';
  actionsEl.innerHTML = '';
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

// Выход со стола
leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});

// Инициализация: HTTP + WS
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
})();
