import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

// URL-параметры
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// DOM-элементы
const tableIdEl     = document.getElementById('table-id');
const statusEl      = document.getElementById('status');
const phaseEl       = document.getElementById('phase');
const holeEl        = document.getElementById('player-self');
const oppEl         = document.getElementById('player-opp');
const communityEl   = document.getElementById('community-cards');
const potEl         = document.getElementById('pot');
const currentBetEl  = document.getElementById('current-bet');
const actionsEl     = document.getElementById('actions');
const leaveBtn      = document.getElementById('leave-btn');

// Выводим номер стола
tableIdEl.textContent = tableId;

/**
 * Блокировка/разблокировка кнопок в зависимости от фазы
 */
function updateControls(state) {
  const phase = state.phase || 'preflop';
  // В preflop и flop разрешим делать ставки, на turn/river тоже
  // Для примера блокируем все, если не ваш ход
  const isMyTurn = state.current_player == userId;
  Array.from(actionsEl.children).forEach(btn => {
    btn.disabled = !isMyTurn;
  });
}

/**
 * Рендер состояния игры с фазами
 */
function renderGameState(state) {
  // Статус ожидания / старта
  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    phaseEl.textContent = '';
    actionsEl.style.display = 'none';
    communityEl.innerHTML = '';
    holeEl.innerHTML = '';
    oppEl.innerHTML = '';
    return;
  }
  statusEl.textContent = 'Игра началась';
  actionsEl.style.display = 'block';

  // Фаза
  const phase = state.phase || 'preflop';
  phaseEl.textContent = 'Фаза: ' + phase;

  // Оппонент
  const players = state.players || [];
  const opp = players.find(p => p.user_id != userId) || {};
  oppEl.innerHTML = `<div>${opp.username || 'Оппонент'}</div><div>🂠 🂠</div>`;

  // Ваши карты
  const hole = state.hole_cards?.[userId] || [];
  holeEl.innerHTML = `<div>Вы: ${username}</div>` +
    hole.map(c => `<span class="card">${c}</span>`).join('');

  // Общие карты: показываем по фазам
  const community = state.community_cards || [];
  let toShow = [];
  if (phase === 'preflop') toShow = [];
  else if (phase === 'flop') toShow = community.slice(0,3);
  else if (phase === 'turn') toShow = community.slice(0,4);
  else if (phase === 'river') toShow = community;
  communityEl.innerHTML = toShow.map(c => `<span class="card">${c}</span>`).join('');

  // Пот и ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Кнопки действий (показываем всегда, но блокируем не в ваш ход)
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.dataset.action = act;
    btn.addEventListener('click', () => {
      let amount = 0;
      if (act === 'bet' || act === 'raise') {
        amount = parseInt(prompt('Введите сумму')) || 0;
      }
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    });
    actionsEl.appendChild(btn);
  });
  updateControls(state);
}

// Инициализация
let ws;
(async () => {
  try {
    const state = await getGameState(tableId);
    renderGameState(state);
  } catch (e) {
    console.error('Init error', e);
  }
  ws = createWebSocket(tableId, userId, username, e => renderGameState(JSON.parse(e.data)));
})();

// Выход со стола
leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});
