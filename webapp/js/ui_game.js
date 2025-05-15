import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

// URL-параметры
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// DOM-элементы
const tableIdEl    = document.getElementById('table-id');
const statusEl     = document.getElementById('status');
const holeCardsEl  = document.getElementById('player-self');
const oppCardsEl   = document.getElementById('player-opp');
const communityEl  = document.getElementById('community-cards');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');

// Отображаем номер стола
tableIdEl.textContent = tableId;

/**
 * Рендерит интерфейс двух игроков и стол с фазами
 */
function renderGameState(state) {
  // Статус
  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    actionsEl.style.display = 'none';
    communityEl.innerHTML = '';
    holeCardsEl.innerHTML = '';
    oppCardsEl.innerHTML = '';
    return;
  }
  statusEl.textContent = 'Игра началась';
  actionsEl.style.display = 'block';

  // Найдём оппонента
  const players = state.players || [];
  const opp = players.find(p => p.user_id != userId);

  // Рендер карманных карт
  const hole = state.hole_cards?.[userId] || [];
  holeCardsEl.innerHTML = `
    <div>Вы: ${username}</div>
    ${hole.map(c => `<span class="card">${c}</span>`).join('')}
  `;

  // Оппонент без раскрытия карт
  oppCardsEl.innerHTML = `
    <div>${opp?.username || 'Оппонент'}</div>
    ${opp ? '🂠 🂠' : ''}
  `;

  // Общие карты (флоп, терн, ривер)
  communityEl.innerHTML = (state.community_cards || []).
    map(c => `<span class="card">${c}</span>`).
    join('');

  // Пот и текущая ставка
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;

  // Кнопки действий
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.addEventListener('click', () => {
      let amount = 0;
      if (act === 'bet' || act === 'raise') {
        amount = parseInt(prompt('Введите сумму')) || 0;
      }
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    });
    actionsEl.appendChild(btn);
  });
}

// Подключаем WS и HTTP-поллинг
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

// Кнопка выхода
leaveBtn.addEventListener('click', async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = '/index.html';
});
