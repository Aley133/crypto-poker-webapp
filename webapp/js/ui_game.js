import { getGameState }   from './api.js';
import { createWebSocket } from './ws.js';

// Параметры из URL
const params    = new URLSearchParams(window.location.search);
const tableId   = params.get('table_id');
const userId    = params.get('user_id');
const username  = params.get('username') || userId;

// DOM-элементы
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;  // единственное сокет-соединение

// Обёртка для безопасной отправки по WS
function safeSend(payload) {
  console.log('→ safeSend:', payload, 'readyState=', ws && ws.readyState);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.warn('WS не готов к отправке:', ws && ws.readyState);
  }
}

// Лог для отладки
function logState(state) {
  console.log('Game state:', state);
}

// Обновляем UI кнопок и инфо
function updateUI(state) {
  logState(state);

  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count||0}/2)`;
    actionsEl.style.display  = 'none';
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    return;
  }

  statusEl.textContent     = 'Игра началась';
  actionsEl.style.display  = 'flex';
  potEl.textContent        = `Пот: ${state.pot||0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;

  const contribs   = state.contributions || {};
  const myContrib  = contribs[userId] || 0;
  const currentBet = state.current_bet || 0;
  const toCall     = currentBet - myContrib;
  const myStack    = state.stacks?.[userId] ?? 0;

  actionsEl.innerHTML = '';

  // Fold
  const foldBtn = document.createElement('button');
  foldBtn.textContent = 'Fold';
  foldBtn.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(foldBtn);

  // Check
  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'Check';
  checkBtn.disabled    = (toCall !== 0);
  checkBtn.onclick     = () => safeSend({ user_id: userId, action: 'check' });
  actionsEl.appendChild(checkBtn);

  // Call
  const callBtn = document.createElement('button');
  callBtn.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  callBtn.disabled    = (toCall <= 0 || myStack < toCall);
  callBtn.onclick     = () => safeSend({ user_id: userId, action: 'call' });
  actionsEl.appendChild(callBtn);

  // Bet
  const betBtn = document.createElement('button');
  betBtn.textContent = 'Bet';
  betBtn.onclick     = () => {
    const amt = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount: amt });
  };
  actionsEl.appendChild(betBtn);

  // Raise
  const raiseBtn = document.createElement('button');
  raiseBtn.textContent = 'Raise';
  raiseBtn.disabled    = (toCall <= 0);
  raiseBtn.onclick     = () => {
    const amt = parseInt(prompt(`Рейз до (>${currentBet})?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: amt });
  };
  actionsEl.appendChild(raiseBtn);
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players   = state.players   || [];
  const community = state.community || [];
  const holeMap   = state.hole_cards || {};

  const cx     = pokerTableEl.clientWidth  / 2;
  const cy     = pokerTableEl.clientHeight / 2;
  const radius = Math.min(cx, cy) - 60;

  // Отрисовка общих карт
  if (community.length) {
    const commEl = document.createElement('div');
    commEl.className = 'cards';
    commEl.style.position = 'absolute';
    commEl.style.left     = `${cx - community.length*20}px`;
    commEl.style.top      = `${cy - 20}px`;
    community.forEach(card => {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = card;
      commEl.appendChild(c);
    });
    pokerTableEl.appendChild(commEl);
  }

  // Игроки по кругу (вы — внизу)
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

    // Имя
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    // Карты
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    const hand = holeMap[p.user_id] || [];
    hand.forEach(card => {
      const cd = document.createElement('div');
      cd.className = 'card';
      cd.textContent = (String(p.user_id)===userId) ? card : '🂠';
      cardsEl.appendChild(cd);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

// === Инициализация один раз ===
(async function init() {
  // Показываем ID стола
  document.getElementById('table-id').textContent = tableId;

  // Получаем начальное состояние
  const initState = await getGameState(tableId);
  updateUI(initState);
  renderTable(initState);

  // Открываем WS
  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });

  // Выход из стола
  leaveBtn.onclick = async () => {
    await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
    window.location.href = 'index.html';
  };
})();
