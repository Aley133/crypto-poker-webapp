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

// Убедимся, что в HTML внутри #actions есть контейнер:
// <div id="actions"><div class="action-buttons-wrapper"></div></div>
const wrapperEl = actionsEl.querySelector('.action-buttons-wrapper');

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
  // Результат раздачи
  if (state.phase === 'result') {
    wrapperEl.innerHTML = ''; // убираем кнопки
    pokerTableEl.style.display = 'none';
    actionsEl.style.display    = 'none';
    statusEl.style.display     = 'none';
    potEl.style.display        = 'none';
    currentBetEl.style.display = 'none';

    // Показываем оверлей
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
    return;
  }

  // Снимаем оверлей
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // До старта
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    wrapperEl.innerHTML      = '';
    actionsEl.style.display  = 'none';
    return;
  }

  // Подготовка статуса и панели
  const isMyTurn = String(state.current_player) === String(userId);
  statusEl.textContent     = isMyTurn
    ? 'Ваш ход'
    : `Ход игрока: ${state.usernames[state.current_player] || state.current_player}`;
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  actionsEl.style.display  = 'block';

  // Расчёт вкладов для Call/Check
  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  // Очистка старых кнопок
  wrapperEl.innerHTML = '';

  // Создаём кнопки
  const btnFold  = document.createElement('button');
  const btnCheck = document.createElement('button');
  const btnCall  = document.createElement('button');
  const btnBet   = document.createElement('button');

  btnFold.textContent  = 'Fold';
  btnCheck.textContent = 'Check';
  btnCall.textContent  = toCall > 0 ? `Call ${toCall}` : 'Call';
  // Bet ↔ Raise
  if (cb > 0) {
    btnBet.textContent = 'Raise';
    btnBet.className   = 'poker-action-btn raise';
  } else {
    btnBet.textContent = 'Bet';
    btnBet.className   = 'poker-action-btn bet';
  }

  // Общие классы и обработчики
  [btnFold, btnCheck, btnCall, btnBet].forEach(btn => {
    btn.classList.add('poker-action-btn');
    wrapperEl.appendChild(btn);
  });

  btnFold.classList.add('fold');
  btnFold.onclick  = () => safeSend({ user_id: userId, action: 'fold' });

  btnCheck.classList.add('check');
  btnCheck.onclick = () => safeSend({ user_id: userId, action: 'check' });

  btnCall.classList.add('call');
  btnCall.onclick  = () => safeSend({ user_id: userId, action: 'call' });

  btnBet.onclick   = () => {
    const amount = parseInt(prompt(`${btnBet.textContent} amount?`), 10) || 0;
    safeSend({ user_id: userId, action: btnBet.textContent.toLowerCase(), amount });
  };

  // Если ставка > 0, добавляем кнопку Raise (либо вместо кнопки Bet)
  let btnRaise = null;
  if (cb > 0) {
    btnRaise = btnBet; // уже отражает Raise
  }

  // Собираем все кнопки для управления состоянием
  const allBtns = btnRaise ? [btnFold, btnCheck, btnCall, btnRaise] : [btnFold, btnCheck, btnCall, btnBet];

  // Устанавливаем disabled и классы .dimmed/.highlight
  if (!isMyTurn) {
    allBtns.forEach(b => {
      b.disabled = true;
      b.classList.add('dimmed');
      b.classList.remove('highlight');
    });
  } else {
    // Fold всегда доступен
    btnFold.disabled = false;
    btnFold.classList.add('highlight');
    btnFold.classList.remove('dimmed');

    // Check vs Call
    if (toCall > 0) {
      btnCheck.disabled = true;
      btnCheck.classList.add('dimmed');
      btnCheck.classList.remove('highlight');

      btnCall.disabled = myStack < toCall;
      btnCall.classList.add('highlight');
      btnCall.classList.remove('dimmed');
    } else {
      btnCall.disabled = true;
      btnCall.classList.add('dimmed');
      btnCall.classList.remove('highlight');

      btnCheck.disabled = false;
      btnCheck.classList.add('highlight');
      btnCheck.classList.remove('dimmed');
    }

    // Bet/Raise всегда доступен
    btnBet.disabled = false;
    btnBet.classList.add('highlight');
    btnBet.classList.remove('dimmed');
  }
}

// ======= WS + Логика =======
const ws = createWebSocket(tableId, userId, username, e => {
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

// Перерендер стола при изменении размеров
window.addEventListener('resize', () => {
  if (window.currentTableState) renderTable(window.currentTableState, userId);
});

// Hotfix: повторный рендер жестко
setTimeout(() => {
  if (window.currentTableState) renderTable(window.currentTableState, userId);
}, 200);
