import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';

console.log('[ui_game] loaded, params:', {
  tableId: new URLSearchParams(window.location.search).get('table_id'),
  userId: new URLSearchParams(window.location.search).get('user_id')
});

// --- Params ---
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

window.currentTableId = tableId;
window.currentUserId  = userId;

// Подставьте реальный размер большого блайнда (если у вас BIG_BLIND = 2)
const BIG_BLIND = 2;

// DOM elements
const statusEl       = document.getElementById('status');
const potEl          = document.getElementById('pot');
const currentBetEl   = document.getElementById('current-bet');
const actionsEl      = document.getElementById('actions');
const leaveBtn       = document.getElementById('leave-btn');
const pokerTableEl   = document.getElementById('poker-table');
console.log('[ui_game] leaveBtn element:', leaveBtn);

let ws;

// Храним предыдущую улицу, чтобы сбрасывать авто-режимы при смене
let lastRound = null;

// Авто-настройки
let autoFoldEnabled = false;
let autoCallEnabled = false;
let lastCallAmount = 0;      // храним toCall в момент включения auto-call
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

// Баннер победителя
const winnerBannerEl = document.createElement('div');
winnerBannerEl.id = 'winner-banner';
document.body.appendChild(winnerBannerEl);

// Добавляем CSS-класс для «затемнения» кнопок
const style = document.createElement('style');
style.textContent = `
  .dimmed {
    opacity: 0.4;
  }
`;
document.head.appendChild(style);

// Безопасная отправка WS
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Планирование авто-действия (с задержкой, чтобы учесть быстрые рейзы)
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

    // Если авто-call включён, но ставка выросла → сбрасываем авто-call
    if (autoCallEnabled && toCall > lastCallAmount) {
      autoCallEnabled = false;
      highlightButtons();
      return;
    }

    // Авто-call
    if (autoCallEnabled && toCall > 0 && myStack >= toCall) {
      safeSend({ user_id: userId, action: 'call' });
    }
    // Авто-fold (только если нет открытой ставки)
    else if (autoFoldEnabled && toCall === 0) {
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

// Подсветка кнопок Fold и Call при активных авто-режимах
function highlightButtons() {
  const btnFold = document.querySelector('.btn-fold');
  const btnCall = document.querySelector('.btn-call');
  if (btnFold) {
    btnFold.style.backgroundColor = autoFoldEnabled ? '#ff4d4d' : '';
  }
  if (btnCall) {
    btnCall.style.backgroundColor = autoCallEnabled ? '#ffd24d' : '';
  }
}

// ======= UI Logic =======
function updateUI(state) {
  // Сброс авто-режимов при старте новой раздачи:
  if (state.started && lastRound === null) {
    autoFoldEnabled = false;
    autoCallEnabled = false;
  }

  // Сброс авто-режимов при смене улицы (current_round) — если lastRound отличается
  if (lastRound !== null && state.current_round !== lastRound) {
    autoFoldEnabled = false;
    autoCallEnabled = false;
  }

  // После применения сброса, обновляем lastRound на текущий раунд
  lastRound = state.current_round;

  window.currentTableState = state;

  // 1) Если стадия «result» – показываем баннер победителя и сбрасываем таймаут
  if (state.phase === 'result') {
    clearAutoAction();
    resultOverlayEl.style.display = 'none';
    winnerBannerEl.classList.remove('visible');
    if (Array.isArray(state.winner)) {
      winnerBannerEl.textContent = `Split pot: ${state.winner.map(u => state.usernames[u] || u).join(', ')}`;
    } else {
      winnerBannerEl.textContent = `Winner: ${state.usernames[state.winner] || state.winner}`;
    }
    winnerBannerEl.classList.add('visible');
    actionsEl.style.display = 'none';
    return;
  }

  // 2) Скрываем баннер и показываем UI
  resultOverlayEl.style.display = 'none';
  winnerBannerEl.classList.remove('visible');
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // 3) Если раздача не началась, показываем «Ожидаем игроков» и сбрасываем таймаут
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    clearAutoAction();
    lastRound = null;
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  const contribs = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb = state.current_bet || 0;
  const toCall = cb - myContrib;
  const myStack = state.stacks?.[userId] ?? 0;

  // Если это мой ход и включён хоть один авто-режим — запускаем планировщик
  if (isMyTurn && (autoCallEnabled || autoFoldEnabled)) {
    if (autoCallEnabled) {
      lastCallAmount = toCall;
    }
    scheduleAutoAction();
  } else {
    clearAutoAction();
  }

  // Показываем чей сейчас ход
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

  // Добавляем «dimmed» ко всем кнопкам, если очередь не ваша
  const dimClass = !isMyTurn ? 'dimmed' : '';

  // 1) Fold
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.className   = `btn btn-fold ${dimClass}`;
  btnFold.style.backgroundColor = autoFoldEnabled ? '#ff4d4d' : '';
  btnFold.onclick     = () => {
    if (!isMyTurn) {
      autoFoldEnabled = !autoFoldEnabled;
      if (autoFoldEnabled) autoCallEnabled = false;
      highlightButtons();
      clearAutoAction();
    } else {
      safeSend({ user_id: userId, action: 'fold' });
    }
  };
  actionsEl.appendChild(btnFold);

  // 2) Call
  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.className   = `btn btn-call ${dimClass}`;
  btnCall.style.backgroundColor = autoCallEnabled ? '#ffd24d' : '';
  btnCall.onclick     = () => {
    if (!isMyTurn) {
      autoCallEnabled = !autoCallEnabled;
      if (autoCallEnabled) autoFoldEnabled = false;
      highlightButtons();
      clearAutoAction();
    } else {
      if (toCall > 0 && myStack >= toCall) {
        safeSend({ user_id: userId, action: 'call' });
      }
    }
  };
  actionsEl.appendChild(btnCall);

  // 3) Check
  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.className   = `btn btn-check ${dimClass}`;
  btnCheck.onclick     = () => {
    if (isMyTurn && toCall === 0) {
      safeSend({ user_id: userId, action: 'check' });
    }
  };
  actionsEl.appendChild(btnCheck);

  // 4) Bet / Raise
  const btnBetOrRaise = document.createElement('button');

  if (cb > 0) {
    btnBetOrRaise.textContent = 'Raise';
    btnBetOrRaise.className   = `btn btn-bet ${dimClass}`;
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
    btnBetOrRaise.className   = `btn btn-bet ${dimClass}`;
    btnBetOrRaise.onclick     = () => {
      if (!isMyTurn) return;
      const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
      if (amount > 0 && amount <= myStack) {
        safeSend({ user_id: userId, action: 'bet', amount });
      }
    };
  }
  actionsEl.appendChild(btnBetOrRaise);

  highlightButtons();
}

// ======= WS + Логика =======
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  window.currentTableState = state;
  updateUI(state);
  renderTable(state, userId);
});

// === Обработчик кнопки «Покинуть стол» ===
if (!leaveBtn) {
  console.error('[ui_game] #leave-btn not found');
} else {
  console.log('[ui_game] binding click handler to leaveBtn');
  leaveBtn.addEventListener('click', async () => {
    console.log('[ui_game] leaveBtn click event fired');
    window.currentTableState = null;

    // 1) Закрываем WS
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    // 2) Оповещаем сервер о выходе
    try {
      const res = await fetch(
        `/api/leave?table_id=${tableId}&user_id=${userId}`,
        { method: 'POST' }
      );
      console.log('[ui_game] /api/leave status:', res.status);
    } catch (e) {
      console.error('[ui_game] leave fetch error', e);
    }

    // 3) Скрываем UI стола и кнопки
    if (document.getElementById('game-info'))
      document.getElementById('game-info').style.display = 'none';
    if (document.querySelector('.action-buttons-wrapper'))
      document.querySelector('.action-buttons-wrapper').style.display = 'none';
    leaveBtn.style.display = 'none';
    if (pokerTableEl) pokerTableEl.style.display = 'none';

    // 4) Показываем сообщение о выходе
    const msg = document.createElement('div');
    msg.textContent = 'Вы покинули стол';
    msg.style.textAlign = 'center';
    msg.style.margin = '20px';
    msg.style.fontSize = '18px';
    document.body.appendChild(msg);
  });
}

window.currentUserId = userId;

// При изменении размеров окна — перерендер стола
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

