import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';

// --- Params ---
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// Подставьте реальный размер большого блайнда
const BIG_BLIND = 2;

// DOM elements
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;
// Флаг, чтобы автодействие сработало только один раз на каждый «ход»
let autoActionSent = false;

// Overlay для результата
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  background: 'rgba(0, 0, 0, 0.8)',
  color: '#fff',
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'column',
  fontFamily: 'sans-serif',
  fontSize: '18px',
  zIndex: '1000'
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
  // Если стадия «result» – показываем оверлей
  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    autoActionSent = false; // сброс флага
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

    resultOverlayEl.style.display    = 'flex';
    pokerTableEl.style.display       = 'none';
    actionsEl.style.display          = 'none';
    statusEl.style.display           = 'none';
    potEl.style.display              = 'none';
    currentBetEl.style.display       = 'none';
    return;
  }

  // Скрываем оверлей
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // Если нет игры – «ожидаем»
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    autoActionSent = false;
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  const contribs = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb = state.current_bet || 0;
  const toCall = cb - myContrib;
  const myStack = state.stacks?.[userId] ?? 0;

  // Автоклик: если это мой ход и ещё не отправлено авто-действие:
  if (isMyTurn && !autoActionSent) {
    // Логика: если есть что коллить, делаем Call; иначе Fold.
    if (toCall > 0 && myStack >= toCall) {
      safeSend({ user_id: userId, action: 'call' });
    } else {
      safeSend({ user_id: userId, action: 'fold' });
    }
    autoActionSent = true;
  }
  // Когда ход не мой – сбрасываем флаг, чтобы при следующем моём ходе автоклик сработал
  if (!isMyTurn) {
    autoActionSent = false;
  }

  // Если не мой ход – отображаем статус и скрываем кнопки, но они остаются в DOM
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'flex';
    actionsEl.innerHTML      = ''; // рендерим кнопки, но все disabled ниже
  } else {
    statusEl.textContent     = 'Ваш ход';
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'flex';
    actionsEl.innerHTML      = '';
  }

  // Отрисовываем ВСЕГДА четыре кнопки, но делаем disabled, если не мой ход
  const disabledAll = !isMyTurn;

  // 1) Fold
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.className   = 'poker-action-btn poker-action-fold';
  btnFold.disabled    = disabledAll;
  btnFold.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(btnFold);

  // 2) Call
  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.className   = 'poker-action-btn poker-action-call';
  btnCall.disabled    = disabledAll || !(toCall > 0 && myStack >= toCall);
  btnCall.onclick     = () => {
    if (toCall > 0 && myStack >= toCall) {
      safeSend({ user_id: userId, action: 'call' });
    }
  };
  actionsEl.appendChild(btnCall);

  // 3) Check
  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.className   = 'poker-action-btn poker-action-check';
  btnCheck.disabled    = disabledAll || (toCall !== 0);
  btnCheck.onclick     = () => {
    if (toCall === 0) {
      safeSend({ user_id: userId, action: 'check' });
    }
  };
  actionsEl.appendChild(btnCheck);

  // 4) Bet / Raise
  const btnBetOrRaise = document.createElement('button');
  // Определяем, на каком раунде текущая улица
  const isPostFlop = state.current_round !== 'pre-flop';
  // На стадии «flop» (ровно три community-карты) тоже пишем «Bet»
  const communityCards = state.community || [];
  const isFlopStage = communityCards.length >= 3 && state.current_round === 'flop';
  const forceBet = isFlopStage || isPostFlop;

  if (forceBet) {
    btnBetOrRaise.textContent = 'Bet';
    btnBetOrRaise.className   = 'poker-action-btn poker-action-bet';
    btnBetOrRaise.disabled    = disabledAll || (myStack <= 0);
    btnBetOrRaise.onclick     = () => {
      const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
      if (amount > 0 && amount <= myStack) {
        safeSend({ user_id: userId, action: 'bet', amount });
      }
    };
  } else {
    if (cb > 0) {
      btnBetOrRaise.textContent = 'Raise';
      btnBetOrRaise.className   = 'poker-action-btn poker-action-raise';
      const minRaise = Math.max(cb * 2, cb + 1);
      btnBetOrRaise.disabled = disabledAll || !((myContrib + myStack) >= minRaise);
      btnBetOrRaise.onclick  = () => {
        const target = parseInt(prompt(`Raise to at least ${minRaise}?`), 10) || 0;
        if (target >= minRaise && target <= (myContrib + myStack)) {
          safeSend({ user_id: userId, action: 'raise', amount: target });
        }
      };
    } else {
      btnBetOrRaise.textContent = 'Bet';
      btnBetOrRaise.className   = 'poker-action-btn poker-action-bet';
      btnBetOrRaise.disabled    = disabledAll || (myStack <= 0);
      btnBetOrRaise.onclick     = () => {
        const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
        if (amount > 0 && amount <= myStack) {
          safeSend({ user_id: userId, action: 'bet', amount });
        }
      };
    }
  }
  actionsEl.appendChild(btnBetOrRaise);
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
