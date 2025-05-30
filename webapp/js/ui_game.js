import { createWebSocket } from './ws.js';
import { renderTable } from './table_render.js';
import renderActions from './actionsManager.js';

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

// Ensure .action-buttons-wrapper exists inside #actions
let wrapperEl = actionsEl.querySelector('.action-buttons-wrapper');
if (!wrapperEl) {
  wrapperEl = document.createElement('div');
  wrapperEl.classList.add('action-buttons-wrapper');
  actionsEl.appendChild(wrapperEl);
}

// Overlay for end‐of‐hand result
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
  background: 'rgba(0,0,0,0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

// Placeholder for WebSocket
let ws;

// Safe WS send helper
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Main UI update function
function updateUI(state) {
  // === Result phase ===
  if (state.phase === 'result') {
    // hide main UI
    pokerTableEl.style.display    = 'none';
    actionsEl.style.display       = 'none';
    statusEl.style.display        = 'none';
    potEl.style.display           = 'none';
    currentBetEl.style.display    = 'none';
    wrapperEl.innerHTML           = '';

    // build overlay
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

  // === Show main UI ===
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  // === Before game start ===
  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    wrapperEl.innerHTML      = '';
    return;
  }

  // === During game ===
  const isMyTurn = String(state.current_player) === String(userId);

  // update status and pot info
  statusEl.textContent     = isMyTurn
    ? 'Ваш ход'
    : `Ход игрока: ${state.usernames[state.current_player] || state.current_player}`;
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // show actions panel
  actionsEl.style.display = '';

  // render action buttons via external manager
  wrapperEl.innerHTML = '';
  renderActions(wrapperEl, state, userId, payload => safeSend(payload));

  // finally, draw the table
  renderTable(state, userId);
}

// ===== WebSocket setup =====
ws = createWebSocket(tableId, userId, username, event => {
  const state = JSON.parse(event.data);
  window.currentTableState = state;
  updateUI(state);
});

// leave button
leaveBtn.onclick = async () => {
  window.currentTableState = null;
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/lobby';
};

window.currentUserId = userId;

// rerender on resize
window.addEventListener('resize', () => {
  if (window.currentTableState) {
    renderTable(window.currentTableState, userId);
    updateUI(window.currentTableState);
  }
});

// hotfix extra render
setTimeout(() => {
  if (window.currentTableState) updateUI(window.currentTableState);
}, 200);
