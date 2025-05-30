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

// Button pending states
let foldPending = false;
let callPending = false;

// Ensure .action-buttons-wrapper exists
let wrapperEl = actionsEl.querySelector('.action-buttons-wrapper');
if (!wrapperEl) {
  wrapperEl = document.createElement('div');
  wrapperEl.classList.add('action-buttons-wrapper');
  actionsEl.appendChild(wrapperEl);
}

// Overlay for result
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
  background: 'rgba(0,0,0,0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

// Placeholder for WebSocket
let ws;

// Safe WS send
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Main UI update
function updateUI(state) {
  // --- Result phase ---
  if (state.phase === 'result') {
    pokerTableEl.style.display = 'none';
    actionsEl.style.display    = 'none';
    statusEl.style.display     = 'none';
    potEl.style.display        = 'none';
    currentBetEl.style.display = 'none';
    wrapperEl.innerHTML        = '';

    resultOverlayEl.innerHTML = '';
    const header = document.createElement('div');
    header.style.marginBottom = '20px';
    header.textContent = Array.isArray(state.winner)
      ? `Split pot: ${state.winner.map(u => state.usernames[u] || u).join(', ')}`
      : `Winner: ${state.usernames[state.winner] || state.winner}`;
    resultOverlayEl.appendChild(header);

    const handsDiv = document.createElement('div');
    Object.entries(state.revealed_hands || {}).forEach(([uid, cards]) => {
      const p = document.createElement('div');
      p.textContent = `${state.usernames[uid] || uid}: ${cards.join(' ')}`;
      handsDiv.appendChild(p);
    });
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

  // Show main UI
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // Before game starts
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    wrapperEl.innerHTML      = '';
    return;
  }

  // Compute turn & stacks
  const isMyTurn  = String(state.current_player) === String(userId);
  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  // Auto-send pending action at turn
  if (isMyTurn) {
    if (foldPending) {
      foldPending = false;
      safeSend({ user_id: userId, action: 'fold' });
      return;
    }
    if (callPending && toCall > 0) {
      callPending = false;
      safeSend({ user_id: userId, action: 'call' });
      return;
    }
  }

  // Update status display
  statusEl.textContent     = isMyTurn
    ? 'Ваш ход'
    : `Ход игрока: ${state.usernames[state.current_player] || state.current_player}`;
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  actionsEl.style.display  = '';

  // Clear old buttons
  wrapperEl.innerHTML = '';

  // Create buttons
  const btnFold  = document.createElement('button');
  const btnCheck = document.createElement('button');
  const btnCall  = document.createElement('button');
  const btnBet   = document.createElement('button');

  btnFold.textContent  = 'Fold';
  btnCheck.textContent = 'Check';
  btnCall.textContent  = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnBet.textContent   = cb > 0 ? 'Raise' : 'Bet';

  // Add base classes
  [btnFold, btnCheck, btnCall, btnBet].forEach(btn => {
    btn.classList.add('poker-action-btn');
    wrapperEl.appendChild(btn);
  });

  // Fold toggle
  btnFold.classList.add('fold');
  btnFold.onclick = () => {
    foldPending = !foldPending;
    btnFold.classList.toggle('pressed', foldPending);
  };

  // Check immediate send
  btnCheck.classList.add('check');
  btnCheck.onclick = () => safeSend({ user_id: userId, action: 'check' });

  // Call toggle
  btnCall.classList.add('call');
  btnCall.onclick = () => {
    if (toCall > 0) {
      callPending = !callPending;
      btnCall.classList.toggle('pressed', callPending);
    }
  };

  // Bet/Raise immediate send
  btnBet.classList.add(cb > 0 ? 'raise' : 'bet');
  btnBet.onclick  = () => {
    const action = btnBet.textContent.toLowerCase();
    const promptText = action === 'bet'
      ? 'Сколько поставить?'
      : `До какого размера рейз? (больше ${cb})`;
    const amount = parseInt(prompt(promptText), 10) || 0;
    safeSend({ user_id: userId, action, amount });
  };

  // All buttons array
  const allBtns = [btnFold, btnCheck, btnCall, btnBet];

  // Apply disabled / dimmed / highlight
  if (!isMyTurn) {
    allBtns.forEach(btn => {
      btn.disabled = false;          // still clickable for toggles
      btn.classList.add('dimmed');
      btn.classList.remove('highlight');
    });
    // But Bet & Check should be fully disabled (not clickable)
    btnBet.disabled   = true;
    btnCheck.disabled = true;
  } else {
    // Highlight available actions
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

    // Bet/Raise
    btnBet.disabled = myStack <= 0;
    btnBet.classList.add('highlight');
    btnBet.classList.remove('dimmed');
  }
}

// ======= WebSocket setup =======
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  window.currentTableState = state;
  updateUI(state);
  renderTable(state, userId);
});

// Leave button
leaveBtn.onclick = async () => {
  window.currentTableState = null;
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/lobby';
};

window.currentUserId = userId;

// Re-render on resize
window.addEventListener('resize', () => {
  if (window.currentTableState) renderTable(window.currentTableState, userId);
});

// Hotfix extra render
setTimeout(() => {
  if (window.currentTableState) renderTable(window.currentTableState, userId);
}, 200);
