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

// Показать номер стола
tableIdEl.textContent = tableId;

/**
 * Рендерит состояние игры
 */
function renderGameState(state) {
  // Статус ожидания / старта
  if (!state.started) {
    const cnt = state.players_count || 0;
    statusEl.textContent = `Ожидаем игроков… (${cnt}/2)`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'block';
  }

  // Карманные карты
  const hole = state.hole_cards?.[userId] || [];
  holeCardsEl.innerHTML = hole.map(c => `<span class="card">${c}</span>`).join('');

  // Общие карты
  const community = state.community_cards || [];
  communityEl.innerHTML = community.map(c => `<span class="card">${c}</span>`).join('');

  // Пот и ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Список игроков
  playersEl.innerHTML = '';
  (state.players || []).forEach(p => {
    const selfClass = p.user_id == userId ? ' self' : '';
    const div = document.createElement('div');
    div.className = `player-card${selfClass}`;
    const stack = state.stacks?.[p.user_id] || 0;
    const bet   = state.bets?.[p.user_id] || 0;
    div.innerHTML = `
      <div class="player-name">${p.username}</div>
      <div class="player-stack">Stack: ${stack}</div>
      <div class="player-bet">Bet: ${bet}</div>
    `;
    playersEl.appendChild(div);
  });

  // Кнопки действий для вашего хода (всегда активны в демо)
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
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

// Инициализация: получение через HTTP и WS
let ws;
(async () => {
  try {
    const state = await getGameState(tableId);
    renderGameState(state);
  } catch (err) {
    console.error('Init error', err);
    statusEl.textContent = 'Ошибка получения состояния';
  }
  ws = createWebSocket(tableId, userId, username, e => renderGameState(JSON.parse(e.data)));
})();

// Вспомогалка: выдаёт координаты (x, y) на окружности радиуса R
function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = (angleDeg - 90) * Math.PI / 180.0;
  return {
    x: cx + (radius * Math.cos(angleRad)),
    y: cy + (radius * Math.sin(angleRad))
  };
}

function renderGameState(state, myUserId) {
  const table = document.getElementById('poker-table');
  table.innerHTML = ''; // очищаем старые сидения

  const players = state.players; // [{user_id, username}, …]
  const center = { x: table.clientWidth/2, y: table.clientHeight/2 };
  const radius = table.clientWidth/2 - 80; // отступ от края

  players.forEach((p, idx) => {
    // вычисляем угол: 360° делим на кол-во, смещаем чтобы "0" — это низ (ваши карты)
    const angle = 360 * idx / players.length + 180;
    const pos = polarToCartesian(center.x, center.y, radius, angle);

    // создаём див для позиции
    const seat = document.createElement('div');
    seat.classList.add('player-seat');
    seat.style.left = `${pos.x - 60}px`; // вычитаем половину ширины
    seat.style.top  = `${pos.y - 30}px`; // вычитаем половину высоты

    // имя
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    // карты
    const cardsEl = document.createElement('div');
    cardsEl.classList.add('cards');
    const hand = state.hands?.[p.user_id] || [];
    hand.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.classList.add('card');
      cardEl.textContent = card; // например, 'K♠' или '10♥'
      cardsEl.appendChild(cardEl);
    });
    seat.appendChild(cardsEl);

    table.appendChild(seat);
  });
}

// Покинуть стол
leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});
