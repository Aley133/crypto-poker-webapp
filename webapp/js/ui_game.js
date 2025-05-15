import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

const tableIdEl    = document.getElementById('table-id');
const statusEl     = document.getElementById('status');
const phaseEl      = document.getElementById('phase');
const oppEl        = document.getElementById('player-opp');
const holeEl       = document.getElementById('player-self');
const communityEl  = document.getElementById('community-cards');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');

tableIdEl.textContent = tableId;

function updateControls(state) {
  const isMyTurn = state.current_player == userId;
  Array.from(actionsEl.children).forEach(btn => btn.disabled = !isMyTurn);
}

function renderGameState(state) {
  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    phaseEl.textContent = '';
    actionsEl.style.display = 'none';
    oppEl.innerHTML = holeEl.innerHTML = communityEl.innerHTML = '';
    potEl.textContent = 'Пот: 0';
    currentBetEl.textContent = 'Текущая ставка: 0';
    return;
  }

  statusEl.textContent = 'Игра началась';
  phaseEl.textContent = 'Фаза: ' + (state.phase || 'preflop');
  actionsEl.style.display = 'block';

  const players = state.players || [];
  const opp = players.find(p => p.user_id != userId) || {};
  oppEl.innerHTML = `<div>${opp.username || 'Оппонент'}</div><div>🂠 🂠</div>`;

  const hole = state.hole_cards?.[userId] || [];
  holeEl.innerHTML = `<div>Вы: ${username}</div>` + hole.map(c => `<span class="card">${c}</span>`).join('');

  const community = state.community_cards || [];
  const phase = state.phase || 'preflop';
  let toShow = [];
  if (phase === 'flop') toShow = community.slice(0,3);
  else if (phase === 'turn') toShow = community.slice(0,4);
  else if (phase === 'river') toShow = community;
  communityEl.innerHTML = toShow.map(c => `<span class="card">${c}</span>`).join('');

  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Кнопки действий
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.addEventListener('click', () => {
      const amount = (act === 'bet' || act === 'raise') ? (parseInt(prompt('Введите сумму')) || 0) : 0;
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    });
    actionsEl.appendChild(btn);
  });
  updateControls(state);
}

let ws;
(async () => {
  const initial = await getGameState(tableId);
  renderGameState(initial);
  ws = createWebSocket(tableId, userId, username, e => renderGameState(JSON.parse(e.data)));
})();

leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});
