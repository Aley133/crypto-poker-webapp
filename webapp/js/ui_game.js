import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';

// --- Params ---
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// Подставьте реальный размер большого блайнда (если у вас BIG_BLIND = 2, оставьте 2; иначе поправьте)
const BIG_BLIND = 2;

// DOM elements
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;
// Флаг, чтобы автодействие не срабатывало до тех пор, пока мы не убедимся в финальном toCall
let autoActionPending = false;

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
  // Если стадия «result» – показываем оверлей и сбрасываем авто-флаг
  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    autoActionPending = false;

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

  // Если нет игры — “ожидаем” и сбрасываем авто-флаг
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    autoActionPending = false;
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  const contribs = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb = state.current_bet || 0;
  const toCall = cb - myContrib;
  const myStack = state.stacks?.[userId] ?? 0;

  // Автоклик: если это мой ход и ещё не запланировано авто-действие
  if (isMyTurn && !autoActionPending) {
    autoActionPending = true;

    // Ждём 10 мс, чтобы, возможно, успел прилететь новый стейт с более высоким toCall
    setTimeout(() => {
      // Берём свежий state из глобальной переменной
      const freshState = window.currentTableState;
      const freshContribs = freshState.contributions || {};
      const freshMyContrib = freshContribs[userId] || 0;
      const freshCb = freshState.current_bet || 0;
      const freshToCall = freshCb - freshMyContrib;
      const freshStack = freshState.stacks?.[userId] ?? 0;

      if (freshState.phase !== 'result' && freshState.started && String(freshState.current_player) === String(userId)) {
        if (freshToCall > 0 && freshStack >= freshToCall) {
          safeSend({ user_id: userId, action: 'call' });
        } else {
          safeSend({ user_id: userId, action: 'fold' });
        }
      }
      // После отправки авто-действия флаг остаётся true. 
      // Сбросим его, когда придёт новый стейт, где не мой ход:
      // это произойдёт дальше в updateUI.
    }, 10);
  }

  // Если не мой ход – сбрасываем авто-флаг и рендерим «светлые» кнопки, но disabled
  if (!isMyTurn) {
    autoActionPending = false;

    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'flex';
    actionsEl.innerHTML      = ''; // впоследствии заполним кнопками
  } else {
    statusEl.textContent     = 'Ваш ход';
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'flex';
    actionsEl.innerHTML      = '';
  }

  // Рендерим СО ВСЕМИ четырьмя кнопками, но, если не мой ход, просто делаем их disabled.
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
  // Вычисляем, на каком раунде (stadia): если флоп, то force «Bet»
  const communityCards = state.community || [];
  const isFlopStage = communityCards.length >= 3 && state.current_round === 'flop';
  const isPostFlop   = state.current_round !== 'pre-flop';

  if (isFlopStage || isPostFlop) {
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
    // Префлоп: если есть ставка > 0 → «Raise», иначе → «Bet»
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
  // Сохраняем стейт в глобал, чтобы авто-функция брала обновлённые значения
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
