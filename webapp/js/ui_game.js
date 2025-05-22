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

// Overlay для отображения результата раздачи
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function updateUI(state) {
  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.marginBottom = '20px';
    if (Array.isArray(state.winner)) {
      msg.textContent = `Split pot: ${state.winner.map(u => state.usernames[u]||u).join(', ')}`;
    } else {
      msg.textContent = `Winner: ${state.usernames[state.winner]||state.winner}`;
    }
    resultOverlayEl.appendChild(msg);
    const handsDiv = document.createElement('div');
    for (const [uid, cards] of Object.entries(state.revealed_hands || {})) {
      const p = document.createElement('div');
      p.textContent = `${state.usernames[uid]||uid}: ${cards.join(' ')}`;
      handsDiv.appendChild(p);
    }
    resultOverlayEl.appendChild(handsDiv);
    if (state.split_pots) {
      const splitDiv = document.createElement('div');
      splitDiv.style.marginTop = '20px';
      splitDiv.textContent = 'Payouts: ' +
        Object.entries(state.split_pots)
          .map(([uid, amt]) => `${state.usernames[uid]||uid}: ${amt}`)
          .join(', ');
      resultOverlayEl.appendChild(splitDiv);
    }
    resultOverlayEl.style.display = 'flex';
    pokerTableEl.style.display    = 'none';
    actionsEl.style.display       = 'none';
    statusEl.style.display        = 'none';
    potEl.style.display           = 'none';
    currentBetEl.style.display    = 'none';
    return;
  }
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count||0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot||0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  statusEl.textContent     = 'Ваш ход';
  potEl.textContent        = `Пот: ${state.pot||0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;
  actionsEl.style.display  = 'flex';
  actionsEl.innerHTML      = '';

  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(btnFold);

  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.disabled    = toCall !== 0;
  btnCheck.onclick     = () => safeSend({ user_id: userId, action: 'check' });
  actionsEl.appendChild(btnCheck);

  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.disabled    = toCall <= 0 || myStack < toCall;
  btnCall.onclick     = () => safeSend({ user_id: userId, action: 'call' });
  actionsEl.appendChild(btnCall);

  const btnBet = document.createElement('button');
  btnBet.textContent = 'Bet';
  btnBet.onclick     = () => {
    const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount });
  };
  actionsEl.appendChild(btnBet);

  const btnRaise = document.createElement('button');
  btnRaise.textContent = 'Raise';
  btnRaise.disabled    = toCall <= 0;
  btnRaise.onclick     = () => {
    const target = parseInt(prompt(`Рейз до суммы > ${cb}?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: target });
  };
  actionsEl.appendChild(btnRaise);
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players   = state.players || [];
  const community = state.community || [];
  const holeMap   = state.hole_cards || {};
  const cx     = pokerTableEl.clientWidth / 2;
  const cy     = pokerTableEl.clientHeight / 2;
  const radius = Math.min(cx, cy) - 60;
  if (community.length) {
    const commEl = document.createElement('div'); commEl.className = 'cards'; commEl.style.position = 'absolute'; commEl.style.left = `${cx - community.length*20}px`; commEl.style.top = `${cy - 20}px`;
    community.forEach(card => { const c = document.createElement('div'); c.className = 'card'; c.textContent = card; commEl.appendChild(c); });
    pokerTableEl.appendChild(commEl);
  }
  const myIdx = players.findIndex(p => String(p.user_id) === userId);
  const ordered = myIdx >= 0 ? players.slice(myIdx).concat(players.slice(0, myIdx)) : players;
  ordered.forEach((p, i) => {
    const angle = 360 * i / ordered.length + 180;
    const pos   = polarToCartesian(cx, cy, radius, angle);
    const seat = document.createElement('div'); seat.className = 'player-seat'; seat.style.left = `${pos.x}px`; seat.style.top = `${pos.y}px`;
    const nm = document.createElement('div'); nm.textContent = p.username; seat.appendChild(nm);
    const cardsEl = document.createElement('div'); cardsEl.className = 'cards';
    (holeMap[p.user_id] || []).forEach(card => { const cd = document.createElement('div'); cd.className = 'card'; cd.textContent = String(p.user_id) === userId ? card : '🂠'; cardsEl.appendChild(cd); });
    seat.appendChild(cardsEl);
    pokerTableEl.appendChild(seat);
  });
}

(function init() {
  document.getElementById('table-id').textContent = tableId;

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
