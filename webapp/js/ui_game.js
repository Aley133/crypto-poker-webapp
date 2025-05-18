import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

// URL-параметры
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// DOM-элементы
const tableIdEl    = document.getElementById('table-id');
const statusEl     = document.getElementById('status');
const holeCardsEl  = document.getElementById('hole-cards');
const communityEl  = document.getElementById('community-cards');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const playersEl    = document.getElementById('players');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

// Показать номер стола
tableIdEl.textContent = tableId;

// Обновление UI-элементов (список игроков, статус, карты, ставки)
function updateUI(state) {
  if (!state.started) {
    const cnt = state.players_count || 0;
    statusEl.textContent = `Ожидаем игроков… (${cnt}/2)`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'flex';
  }

  // Карманные карты игрока
  const hole = state.hole_cards?.[userId] || [];
  holeCardsEl.innerHTML = hole.map(c => `<span class="card">${c}</span>`).join('');

  // Общие карты
  const community = state.community_cards || [];
  communityEl.innerHTML = community.map(c => `<span class="card">${c}</span>`).join('');

  // Пот и текущая ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Стек и ставки каждого игрока
  playersEl.innerHTML = '';
  (state.players || []).forEach(p => {
    const div = document.createElement('div');
    div.className = p.user_id == userId ? 'player-card self' : 'player-card';
    const stack = state.stacks?.[p.user_id] || 0;
    const bet   = state.bets?.[p.user_id] || 0;
    div.innerHTML = `
      <div class="player-name">${p.username}</div>
      <div class="player-stack">Stack: ${stack}</div>
      <div class="player-bet">Bet: ${bet}</div>
    `;
    playersEl.appendChild(div);
  });

  // Кнопки действий
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = act;
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

// Преобразование полярных координат в декартовы
function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = (angleDeg - 90) * Math.PI / 180.0;
  return {
    x: cx + (radius * Math.cos(angleRad)),
    y: cy + (radius * Math.sin(angleRad))
  };
}

// Отрисовка игроков по кругу стола
function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players = state.players || [];
  const center  = { x: pokerTableEl.clientWidth/2, y: pokerTableEl.clientHeight/2 };
  const radius  = pokerTableEl.clientWidth/2 - 80;

  players.forEach((p, idx) => {
    const angle = 360 * idx / players.length + 180;
    const pos   = polarToCartesian(center.x, center.y, radius, angle);

    const seat = document.createElement('div');
    seat.classList.add('player-seat');
    seat.style.left = `${pos.x - 60}px`;
    seat.style.top  = `${pos.y - 30}px`;

    // Имя
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    // Карты (для демонстрации разложим все)
    const cardsEl = document.createElement('div');
    cardsEl.classList.add('cards');
    const hand = state.hole_cards?.[p.user_id] || [];
    hand.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.classList.add('card');
      cardEl.textContent = card;
      cardsEl.appendChild(cardEl);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

let ws;
(async () => {
  try {
    const state = await getGameState(tableId);
    updateUI(state);
    renderTable(state);
  } catch (err) {
    statusEl.textContent = 'Ошибка получения состояния';
  }

  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });
})();

// Покинуть стол
leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});
