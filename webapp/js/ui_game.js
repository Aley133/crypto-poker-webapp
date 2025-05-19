import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

// Параметры из URL
const params    = new URLSearchParams(window.location.search);
const tableId   = params.get('table_id');
const userId    = params.get('user_id');
const username  = params.get('username') || userId;

// Элементы DOM
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;  // сокет

// Логирование для отладки
function logState(state) {
  console.log('Game state:', state);
}

// Обновляет UI-панель действий и информацию о стаке
function updateUI(state) {
  logState(state);

  // 1) Ожидание / старт
  if (!state.started) {
    statusEl.textContent       = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    actionsEl.style.display    = 'none';
    potEl.textContent          = '';
    currentBetEl.textContent   = '';
    return;
  }
  statusEl.textContent       = 'Игра началась';
  actionsEl.style.display    = 'flex';

  // 2) Пот и текущая ставка
  potEl.textContent          = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent   = `Текущая ставка: ${state.current_bet || 0}`;

  // 3) Считаем вклад и сколько остальное надо докинуть
  const contribs     = state.contributions || {};
  const myContrib    = contribs[userId] || 0;
  const currentBet   = state.current_bet || 0;
  const toCall       = currentBet - myContrib;
  const myStack      = state.stacks?.[userId] ?? 0;

  // 4) Рендерим кнопки
  actionsEl.innerHTML = '';

  // Fold
  const foldBtn = document.createElement('button');
  foldBtn.textContent = 'Fold';
  foldBtn.onclick     = () => ws.send(JSON.stringify({ user_id: userId, action: 'fold' }));
  actionsEl.appendChild(foldBtn);

  // Check
  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'Check';
  checkBtn.disabled    = (toCall !== 0);
  checkBtn.onclick     = () => ws.send(JSON.stringify({ user_id: userId, action: 'check' }));
  actionsEl.appendChild(checkBtn);

  // Call
  const callBtn = document.createElement('button');
  callBtn.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  callBtn.disabled    = (toCall <= 0 || myStack < toCall);
  callBtn.onclick     = () => ws.send(JSON.stringify({ user_id: userId, action: 'call' }));
  actionsEl.appendChild(callBtn);

  // Bet (первая ставка)
  const betBtn = document.createElement('button');
  betBtn.textContent = 'Bet';
  betBtn.onclick     = () => {
    const amt = parseInt(prompt('Сколько поставить?'), 10) || 0;
    ws.send(JSON.stringify({ user_id: userId, action: 'bet', amount: amt }));
  };
  actionsEl.appendChild(betBtn);

  // Raise
  const raiseBtn = document.createElement('button');
  raiseBtn.textContent = 'Raise';
  raiseBtn.disabled    = (toCall <= 0);
  raiseBtn.onclick     = () => {
    const amt = parseInt(prompt(`Рейз до (>${currentBet})?`), 10) || 0;
    ws.send(JSON.stringify({ user_id: userId, action: 'raise', amount: amt }));
  };
  actionsEl.appendChild(raiseBtn);
}

// Преобразование полярных координат в экранные
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Рендеринг стола и карт
function renderTable(state) {
  pokerTableEl.innerHTML = '';

  const players  = state.players || [];
  const community = state.community || [];
  const holeMap  = state.hole_cards || {};

  const cx      = pokerTableEl.clientWidth  / 2;
  const cy      = pokerTableEl.clientHeight / 2;
  const radius  = Math.min(cx, cy) - 60;

  // 1) Общие карты
  if (community.length) {
    const commEl = document.createElement('div');
    commEl.className = 'cards';
    commEl.style.position = 'absolute';
    commEl.style.left = `${cx - (community.length * 20)}px`;
    commEl.style.top  = `${cy - 20}px`;
    community.forEach(card => {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = card;
      commEl.appendChild(c);
    });
    pokerTableEl.appendChild(commEl);
  }

  // 2) Расстановка игроков по кругу (вы — внизу)
  const myIdx = players.findIndex(p => String(p.user_id) === userId);
  const ordered = myIdx >= 0
    ? players.slice(myIdx).concat(players.slice(0, myIdx))
    : players;

  ordered.forEach((p, i) => {
    const angle = 360 * i / ordered.length + 180;
    const pos   = polarToCartesian(cx, cy, radius, angle);

    const seat = document.createElement('div');
    seat.className = 'player-seat';
    seat.style.left = `${pos.x}px`;
    seat.style.top  = `${pos.y}px`;

    // username
    const nm = document.createElement('div');
    nm.textContent = p.username;
    seat.appendChild(nm);

    // карты
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    const hand = holeMap[p.user_id] || [];
    hand.forEach(card => {
      const cd = document.createElement('div');
      cd.className = 'card';
      cd.textContent = (String(p.user_id) === userId) ? card : '🂠';
      cardsEl.appendChild(cd);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

// Основной IIFE: загрузка стейта и WS
(async () => {
  const initState = await getGameState(tableId);
  updateUI(initState);
  renderTable(initState);

  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });
})();

// Кнопка «Покинуть стол»
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
