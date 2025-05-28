import { createWebSocket } from './ws.js';
import { renderTable, positionActionsEl } from './table_render.js';

// --- Params ---
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// DOM elements
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;

// Overlay для результата
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

// Безопасная отправка WS
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// ======= UI Logic =======
function updateUI(state) {
  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.marginBottom = '20px';
    if (Array.isArray(state.winner)) {
      msg.textContent = `Split pot: ${state.winner.map(u => state.usernames[u] || u).join(', ')}`;
    } else {
      msg.textContent = `Winner: ${state.usernames[state.winner] || state.winner}`;
    }
    resultOverlayEl.appendChild(msg);

    const handsDiv = document.createElement('div');
    for (const [uid, cards] of Object.entries(state.revealed_hands || {})) {
      const p = document.createElement('div');
      p.textContent = `${state.usernames[uid] || uid}: ${cards.join(' ')}`;
      handsDiv.appendChild(p);
    }
    resultOverlayEl.appendChild(handsDiv);

    if (state.split_pots) {
      const splitDiv = document.createElement('div');
      splitDiv.style.marginTop = '20px';
      splitDiv.textContent = 'Payouts: ' +
        Object.entries(state.split_pots)
          .map(([uid, amt]) => `${state.usernames[uid] || uid}: ${amt}`)
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

  // Скрываем оверлей результата
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'none';
    actionsEl.innerHTML      = '';
    return;
  }

  // Мой ход: показываем кнопки
  statusEl.textContent     = 'Ваш ход';
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
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

// ======= WS + Логика =======
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  window.currentTableState = state;
  updateUI(state);
  renderTable(state, userId);
  positionActionsEl(state, userId);
});

leaveBtn.onclick = async () => {
  // 1. Можно очистить state, если нужно
  window.currentTableState = null;
  // 2. Сообщить серверу
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  // 3. Перенаправить в лобби
  window.location.href = '/lobby'; // или на нужную страницу
};

window.currentUserId = userId;

// Перерендер стола при изменении размеров окна
window.addEventListener('resize', () => {
  if (window.currentTableState) {
    renderTable(window.currentTableState, userId);
    positionActionsEl(window.currentTableState, userId);
  }
});

// Hotfix: повторный рендер через небольшой таймаут
setTimeout(() => {
  if (window.currentTableState) {
    renderTable(window.currentTableState, userId);
    positionActionsEl(window.currentTableState, userId);
  }
}, 200);
