import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';

// --- Params ---
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// Подставьте реальный размер большого блайнда (если у вас BIG_BLIND = 2)
const BIG_BLIND = 2;

// DOM elements
const statusEl       = document.getElementById('status');
const potEl          = document.getElementById('pot');
const currentBetEl   = document.getElementById('current-bet');
const actionsEl      = document.getElementById('actions');
const leaveBtn       = document.getElementById('leave-btn');
const pokerTableEl   = document.getElementById('poker-table');

let ws;

// Авто-настройки
let autoFoldEnabled = false;
let autoCallEnabled = false;
let lastCallAmount = 0;      // хранит значение toCall, при котором включился авто-call
let autoActionTimeout = null;

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

// Планирование авто-действия
function scheduleAutoAction() {
  clearAutoAction();
  autoActionTimeout = setTimeout(() => {
    const state = window.currentTableState;
    if (!state) return;

    const isMyTurn = String(state.current_player) === String(userId);
    if (!isMyTurn || state.phase === 'result' || !state.started) return;

    const contribs = state.contributions || {};
    const myContrib = contribs[userId] || 0;
    const cb = state.current_bet || 0;
    const toCall = cb - myContrib;
    const myStack = state.stacks?.[userId] ?? 0;

    // Если авто-call был включён, но toCall вырос — сбросим авто-call
    if (autoCallEnabled && toCall > lastCallAmount) {
      autoCallEnabled = false;
      highlightButtons();
      return;
    }

    if (autoCallEnabled && toCall > 0 && myStack >= toCall) {
      safeSend({ user_id: userId, action: 'call' });
    } else if (autoFoldEnabled && toCall === 0) {
      safeSend({ user_id: userId, action: 'fold' });
    }
    autoActionTimeout = null;
  }, 300);
}

function clearAutoAction() {
  if (autoActionTimeout) {
    clearTimeout(autoActionTimeout);
    autoActionTimeout = null;
  }
}

// Подсветка кнопок Fold и Call
function highlightButtons() {
  const btnFold = document.querySelector('.poker-action-fold');
  const btnCall = document.querySelector('.poker-action-call');
  if (btnFold) {
    btnFold.style.backgroundColor = autoFoldEnabled ? '#ff4d4d' : '';
  }
  if (btnCall) {
    btnCall.style.backgroundColor = autoCallEnabled ? '#ffd24d' : '';
  }
}

// Простой CSS-класс для «затемнения» кнопок:
const style = document.createElement('style');
style.textContent = `
  .dimmed {
    opacity: 0.4;
  }
`;
document.head.appendChild(style);

// ======= UI Logic =======
function updateUI(state) {
  window.currentTableState = state;

  // 1) Если стадия «result» – показываем оверлей и сбрасываем таймаут
  if (state.phase === 'result') {
    clearAutoAction();
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

    resultOverlayEl.style.display    = 'flex';
    pokerTableEl.style.display       = 'none';
    actionsEl.style.display          = 'none';
    statusEl.style.display           = 'none';
    potEl.style.display              = 'none';
    currentBetEl.style.display       = 'none';
    return;
  }

  // 2) Скрываем оверлей
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // 3) Если нет игры — «ожидаем» и сбрасываем таймаут
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    clearAutoAction();
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  const contribs = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb = state.current_bet || 0;
  const toCall = cb - myContrib;
  const myStack = state.stacks?.[userId] ?? 0;

  // Если это мой ход и включена любая авто-функция — планируем авто-действие
  if (isMyTurn && (autoCallEnabled || autoFoldEnabled)) {
    if (autoCallEnabled) {
      lastCallAmount = toCall;
    }
    scheduleAutoAction();
  } else {
    clearAutoAction();
  }

  // Отображаем статус
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  } else {
    statusEl.textContent     = 'Ваш ход';
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  }
  actionsEl.style.display = 'flex';
  actionsEl.innerHTML     = '';

  // Класс для затемнения: если не ваш ход, ставим всем кнопкам .dimmed,
  // но не отключаем их полностью — они остаются кликабельными.
  const dimClass = !isMyTurn ? 'dimmed' : '';

  // 1) Fold (всегда кликабельна; если не ваш ход, просто переключает авто-Fold)
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.className   = `poker-action-btn poker-action-fold ${dimClass}`;
  btnFold.style.backgroundColor = autoFoldEnabled ? '#ff4d4d' : '';
  btnFold.onclick     = () => {
    if (!isMyTurn) {
      // переключаем авто-fold
      autoFoldEnabled = !autoFoldEnabled;
      if (autoFoldEnabled) {
        autoCallEnabled = false;
      }
      highlightButtons();
      clearAutoAction();
    } else {
      // если ваш ход, выполняем fold
      safeSend({ user_id: userId, action: 'fold' });
    }
  };
  actionsEl.appendChild(btnFold);

  // 2) Call (всегда кликабельна; если не ваш ход, переключает авто-Call)
  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.className   = `poker-action-btn poker-action-call ${dimClass}`;
  btnCall.style.backgroundColor = autoCallEnabled ? '#ffd24d' : '';
  btnCall.onclick     = () => {
    if (!isMyTurn) {
      // переключаем авто-call
      autoCallEnabled = !autoCallEnabled;
      if (autoCallEnabled) {
        autoFoldEnabled = false;
      }
      highlightButtons();
      clearAutoAction();
    } else {
      // если ваш ход, выполняем call
      if (toCall > 0 && myStack >= toCall) {
        safeSend({ user_id: userId, action: 'call' });
      }
    }
  };
  actionsEl.appendChild(btnCall);

  // 3) Check (всегда кликабельна; если не ваш ход, не делает ничего)
  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.className   = `poker-action-btn poker-action-check ${dimClass}`;
  btnCheck.onclick     = () => {
    if (isMyTurn && toCall === 0) {
      safeSend({ user_id: userId, action: 'check' });
    }
  };
  actionsEl.appendChild(btnCheck);

  // 4) Bet / Raise (альтернативное название: Raise, если cb > 0 на префлопе)
  const btnBetOrRaise = document.createElement('button');
  btnBetOrRaise.className = `poker-action-btn ${dimClass}`;
  const communityCards = state.community || [];
  const isFlopStage   = communityCards.length >= 3 && state.current_round === 'flop';
  const isPostFlop    = state.current_round !== 'pre-flop';

  if (isFlopStage || isPostFlop) {
    btnBetOrRaise.textContent = 'Bet';
    btnBetOrRaise.onclick     = () => {
      if (!isMyTurn) return;
      const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
      if (amount > 0 && amount <= myStack) {
        safeSend({ user_id: userId, action: 'bet', amount });
      }
    };
  } else {
    if (cb > 0) {
      btnBetOrRaise.textContent = 'Raise';
      btnBetOrRaise.onclick     = () => {
        if (!isMyTurn) return;
        const minRaise = Math.max(cb * 2, cb + 1);
        const target = parseInt(prompt(`Raise to at least ${minRaise}?`), 10) || 0;
        if (target >= minRaise && target <= (myContrib + myStack)) {
          safeSend({ user_id: userId, action: 'raise', amount: target });
        }
      };
    } else {
      btnBetOrRaise.textContent = 'Bet';
      btnBetOrRaise.onclick     = () => {
        if (!isMyTurn) return;
        const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
        if (amount > 0 && amount <= myStack) {
          safeSend({ user_id: userId, action: 'bet', amount });
        }
      };
    }
  }
  actionsEl.appendChild(btnBetOrRaise);

  // После добавления кнопок обновим их подсветку
  highlightButtons();
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
