import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');
const username = params.get('username') || userId;

const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

// Логирование состояния для отладки
function logState(state) {
  console.log('Game state:', state);
}

// Обновление UI: статус, пот, ставки и кнопки
function updateUI(state) {
  logState(state);

  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'flex';
  }

  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || state.currentBet || 0}`;

  // Кнопки действий
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.onclick = () => {
      let amount = 0;
      if (act === 'bet' || act === 'raise') {
        amount = parseInt(prompt('Сумма:'), 10) || 0;
      }
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    };
    actionsEl.appendChild(btn);
  });
}

// Преобразование полярных координат в экранные
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Рисуем игроков и общие карты по кругу стола
function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players = state.players || [];
  const cx = pokerTableEl.clientWidth / 2;
  const cy = pokerTableEl.clientHeight / 2;
  const radius = cx - 60;

  // Отрисовка общих карт в центре
  const community = state.community_cards ?? state.community ?? [];
  if (community.length) {
    const commEl = document.createElement('div');
    commEl.className = 'cards';
    commEl.style.position = 'absolute';
    commEl.style.left = `${cx - community.length * 20}px`;
    commEl.style.top  = `${cy - 20}px`;
    community.forEach(card => {
      const cc = document.createElement('div');
      cc.className = 'card';
      cc.textContent = card;
      commEl.appendChild(cc);
    });
    pokerTableEl.appendChild(commEl);
  }

  // Упорядочиваем игроков: вы всегда внизу, остальные по часовой
  const meIdx = players.findIndex(p => String(p.user_id) === userId);
  const ordered = meIdx >= 0
    ? players.slice(meIdx).concat(players.slice(0, meIdx))
    : players;

  // Карты игроков
  const holeMap = state.hole_cards ?? state.hands ?? {};
  ordered.forEach((p, idx) => {
    const angle = 360 * idx / ordered.length + 180;
    const pos   = polarToCartesian(cx, cy, radius, angle);
    const seat  = document.createElement('div');
    seat.className = 'player-seat';
    seat.style.left = `${pos.x}px`;
    seat.style.top  = `${pos.y}px`;

    // Имя игрока (теперь всегда показываем username)
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username || p.user_id;
    seat.appendChild(nameEl);

    // Карманные карты: показывает свои лицом, для остальных рубашку
    const hand = holeMap[String(p.user_id)] || [];
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    hand.forEach(card => {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = String(p.user_id) === userId ? card : '🂠';
      cardsEl.appendChild(c);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

let ws;
(async () => {
  const initState = await getGameState(tableId);
  updateUI(initState);
  renderTable(initState);
  // пропишите так
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});

// сразу после этого
ws.onopen = () => {
  // шлём «запрос синхронизации»
  ws.send(JSON.stringify({ action: 'sync' }));
};
})();

// Обработка кнопки «Покинуть стол»
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
