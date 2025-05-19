import { getGameState }   from './api.js';
import { createWebSocket } from './ws.js';

const params      = new URLSearchParams(window.location.search);
const tableId     = params.get('table_id');
const userId      = params.get('user_id');
const username    = params.get('username') || userId;

const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;

function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    console.warn('WS not open:', ws && ws.readyState, payload);
  }
}

function updateUI(state) {
  // Если игра ещё не стартовала
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count||0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  // Если не мой ход
  if (String(state.current_player) !== String(userId)) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot||0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  // Мой ход
  statusEl.textContent     = 'Ваш ход';
  potEl.textContent        = `Пот: ${state.pot||0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;
  actionsEl.style.display  = 'flex';
  actionsEl.innerHTML      = '';

  const contribs   = state.contributions || {};
  const myContrib  = contribs[userId] || 0;
  const cb         = state.current_bet || 0;
  const toCall     = cb - myContrib;
  const myStack    = state.stacks?.[userId] ?? 0;

  // Fold
  const f = document.createElement('button');
  f.textContent = 'Fold';
  f.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(f);

  // Check
  const c = document.createElement('button');
  c.textContent = 'Check';
  c.disabled    = (toCall !== 0);
  c.onclick     = () => safeSend({ user_id: userId, action: 'check' });
  actionsEl.appendChild(c);

  // Call
  const cl = document.createElement('button');
  cl.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  cl.disabled    = (toCall <= 0 || myStack < toCall);
  cl.onclick     = () => safeSend({ user_id: userId, action: 'call' });
  actionsEl.appendChild(cl);

  // Bet
  const b = document.createElement('button');
  b.textContent = 'Bet';
  b.onclick     = () => {
    const amt = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount: amt });
  };
  actionsEl.appendChild(b);

  // Raise
  const r = document.createElement('button');
  r.textContent = 'Raise';
  r.disabled    = (toCall <= 0);
  r.onclick     = () => {
    const amt = parseInt(prompt(`Рейз до (>${cb})?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: amt });
  };
  actionsEl.appendChild(r);
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI/180;
  return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
}

function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players   = state.players || [];
  const community = state.community || [];
  const holeMap   = state.hole_cards || {};

  const cx     = pokerTableEl.clientWidth  / 2;
  const cy     = pokerTableEl.clientHeight / 2;
  const radius = Math.min(cx, cy) - 60;

  // Общие карты
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

    const nm = document.createElement('div');
    nm.textContent = p.username;
    seat.appendChild(nm);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    (holeMap[p.user_id] || []).forEach(card => {
      const cd = document.createElement('div');
      cd.className = 'card';
      cd.textContent = String(p.user_id) === userId ? card : '🂠';
      cardsEl.appendChild(cd);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

// === Инициализация ===
(async function init() {
  document.getElementById('table-id').textContent = tableId;

  const initState = await getGameState(tableId);
  updateUI(initState);
  renderTable(initState);

  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });

  leaveBtn.onclick = async () => {
    await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
    window.location.href = 'index.html';
  };
})();
