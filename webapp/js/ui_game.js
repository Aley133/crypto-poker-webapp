import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';

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

  // --- Always show Fold ---
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.className   = 'poker-action-btn poker-action-fold';
  btnFold.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(btnFold);

  if (cb === 0) {
    // --- New round: only Bet is available (plus Fold, which is already added) ---
    const btnBet = document.createElement('button');
    btnBet.textContent = 'Bet';
    btnBet.className   = 'poker-action-btn poker-action-bet';
    btnBet.onclick     = () => {
      const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
      if (amount > 0 && amount <= myStack) {
        safeSend({ user_id: userId, action: 'bet', amount });
      }
    };
    actionsEl.appendChild(btnBet);

  } else {
    // There is a current bet
    if (toCall > 0) {
      // Need to call or fold: show Call button, disable Check & Raise
      const btnCall = document.createElement('button');
      btnCall.textContent = `Call ${toCall}`;
      btnCall.className   = 'poker-action-btn poker-action-call';
      btnCall.disabled    = myStack < toCall;
      btnCall.onclick     = () => {
        if (myStack >= toCall) {
          safeSend({ user_id: userId, action: 'call' });
        }
      };
      actionsEl.appendChild(btnCall);

      // Check is not valid until you cover the bet
      const btnCheck = document.createElement('button');
      btnCheck.textContent = 'Check';
      btnCheck.className   = 'poker-action-btn poker-action-check';
      btnCheck.disabled    = true;
      actionsEl.appendChild(btnCheck);

      // Raise is not allowed until you cover the bet
      const btnRaise = document.createElement('button');
      btnRaise.textContent = 'Raise';
      btnRaise.className   = 'poker-action-btn poker-action-raise';
      btnRaise.disabled    = true;
      actionsEl.appendChild(btnRaise);

    } else {
      // toCall === 0: we are even with the current bet
      // Show Check and optionally Raise if there's enough stack to raise

      const btnCheck = document.createElement('button');
      btnCheck.textContent = 'Check';
      btnCheck.className   = 'poker-action-btn poker-action-check';
      btnCheck.onclick     = () => safeSend({ user_id: userId, action: 'check' });
      actionsEl.appendChild(btnCheck);

      // Compute minimum raise: here we use double the current bet as example
      const minRaise = Math.max(cb * 2, cb + 1);

      const btnRaise = document.createElement('button');
      btnRaise.textContent = `Raise > ${minRaise}`;
      btnRaise.className   = 'poker-action-btn poker-action-raise';
      // Enable Raise only if player has enough to make at least minRaise
      btnRaise.disabled    = myStack <= 0 || myStack + myContrib < minRaise;
      btnRaise.onclick     = () => {
        const target = parseInt(prompt(`Рейз до суммы ≥ ${minRaise}?`), 10) || 0;
        if (target >= minRaise && target <= (myContrib + myStack)) {
          safeSend({ user_id: userId, action: 'raise', amount: target });
        }
      };
      actionsEl.appendChild(btnRaise);

      // Call button should simply cover 0 (i.e. a free call), so it's disabled because toCall === 0
      // But if you want to label it differently, you can disable/hide it:
      // const btnCall = document.createElement('button');
      // btnCall.textContent = 'Call';
      // btnCall.className   = 'poker-action-btn poker-action-call';
      // btnCall.disabled    = true;
      // actionsEl.appendChild(btnCall);
    }
  }
}

// ======= WS + Логика =======
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  window.currentTableState = state;
  updateUI(state);
  renderTable(state, userId);
});

leaveBtn.onclick = async () => {
  window.currentTableState = null;
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/lobby';
};

window.currentUserId = userId;

// Перерендер стола при изменении размеров окна
window.addEventListener('resize', () => {
  if (window.currentTableState) {
    renderTable(window.currentTableState, userId);
  }
});

// Hotfix: повторный рендер через небольшой таймаут
setTimeout(() => {
  if (window.currentTableState) {
    renderTable(window.currentTableState, userId);
  }
}, 200);
