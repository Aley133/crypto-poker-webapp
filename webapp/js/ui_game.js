import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

// URL-параметры
const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');
const username = params.get('username') || userId;

// DOM-элементы
const tableIdEl    = document.getElementById('table-id');
const statusEl     = document.getElementById('status');
const stageEl      = document.getElementById('stage');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const communityEl  = document.getElementById('community-cards');
const actionsEl    = document.getElementById('actions');
const pokerTableEl = document.getElementById('poker-table');
const leaveBtn     = document.getElementById('leave-btn');

// Показать номер стола
tableIdEl.textContent = tableId;

// Обновление UI
function updateUI(state) {
  // статус
  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'flex';
  }
  // этап
  const names = { preflop:'Префлоп', flop:'Флоп', turn:'Тёрн', river:'Ривер', showdown:'Шоудаун' };
  stageEl.textContent = `Раунд: ${names[state.stage] || state.stage}`;
  // пот и ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  // общие карты
  communityEl.innerHTML = '';
  (state.community || []).forEach(card => {
    const cc = document.createElement('div');
    cc.className = 'card';
    cc.textContent = card;
    communityEl.appendChild(cc);
  });
  // кнопки действий
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.disabled    = state.current_player.toString() !== userId;
    btn.onclick = () => {
      let amount = 0;
      if (act === 'bet' || act === 'raise') {
        amount = parseInt(prompt('Сумма:'), 10) || 0;
      }
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    };
    actionsEl.appendChild(btn);
  });
}

// полярные
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// отрисовка
function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players = state.players || [];
  const cx = pokerTableEl.clientWidth / 2;
  const cy = pokerTableEl.clientHeight / 2;
  const radius = cx - 80;

  players.forEach((p, idx) => {
    const angle = 360 * idx / players.length + 180;
    const pos   = polarToCartesian(cx, cy, radius, angle);

    const seat = document.createElement('div');
    seat.className = 'player-seat';
    if (p.user_id.toString() === state.current_player.toString()) {
      seat.classList.add('active-player');
    }
    seat.style.left = `${pos.x - 50}px`;
    seat.style.top  = `${pos.y - 30}px`;

    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = `Stack: ${state.stacks[p.user_id] || 0}`;
    seat.appendChild(stackEl);

    const betEl = document.createElement('div');
    betEl.className = 'player-bet';
    betEl.textContent = `Bet: ${state.bets[p.user_id] || 0}`;
    seat.appendChild(betEl);

    const hand = state.hole_cards[p.user_id] || [];
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    hand.forEach(card => {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = p.user_id.toString() === userId ? card : '🂠';
      cardsEl.appendChild(c);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

let ws;
(async () => {
  // начальное состояние
  try {
    const initState = await getGameState(tableId);
    updateUI(initState);
    renderTable(initState);
  } catch (err) {
    console.error('Init error', err);
  }
  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });
  ws.onopen = () => ws.send(JSON.stringify({ action: 'sync' }));
})();

leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
};
