import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id'); // keep as string for comparison
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

// Полярные координаты -> экранные
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players = state.players || [];

  // 1) Делим на “вас” + всех остальных
  const meIdx = players.findIndex(p => String(p.user_id) === userId);
  // если по какой-то причине не нашли — оставляем оригинальный порядок
  const ordered = meIdx >= 0
    ? players.slice(meIdx).concat(players.slice(0, meIdx))
    : players;

  const cx = pokerTableEl.clientWidth / 2;
  const cy = pokerTableEl.clientHeight / 2;
  const radius = cx - 60;

  // … дальше идёт отрисовка community-карт …

  // 2) Теперь рендерим “ordered” вместо “players”
  ordered.forEach((p, idx) => {
    // угол так, чтобы idx=0 (вы) был внизу (180°), остальные вокруг круга
    const angle = 360 * idx / ordered.length + 180;
    const pos   = polarToCartesian(cx, cy, radius, angle);

    // создаём место игрока
    const seat = document.createElement('div');
    seat.className = 'player-seat';
    seat.style.left = `${pos.x}px`;
    seat.style.top  = `${pos.y}px`;

    // имя
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    // карманные карты: только свои лицом, у остальных рубашка
    const hand = (state.hole_cards ?? state.hands ?? {})[String(p.user_id)] || [];
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

  // Карты игроков
  const holeMap = state.hole_cards ?? state.hands ?? {};
  players.forEach((p, idx) => {
    const angle = 360 * idx / players.length + 180;
    const pos = polarToCartesian(cx, cy, radius, angle);

    const seat = document.createElement('div');
    seat.className = 'player-seat';
    seat.style.left = `${pos.x}px`;
    seat.style.top  = `${pos.y}px`;

    // Имя игрока
    const nameEl = document.createElement('div');
    nameEl.textContent = p.username;
    seat.appendChild(nameEl);

    // Карманные карты: ключи в holeMap всегда строки
    const hand = holeMap[String(p.user_id)] || [];
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    hand.forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card';
      // Показываем свои карты, для остальных рубашку
      if (String(p.user_id) === userId) {
        cardDiv.textContent = card;
      } else {
        cardDiv.textContent = '🂠';
      }
      cardsEl.appendChild(cardDiv);
    });
    seat.appendChild(cardsEl);

    pokerTableEl.appendChild(seat);
  });
}

let ws;
(async () => {
  try {
    const initState = await getGameState(tableId);
    updateUI(initState);
    renderTable(initState);
  } catch (err) {
    console.error('Init error', err);
    statusEl.textContent = 'Ошибка получения состояния';
  }

  ws = createWebSocket(tableId, userId, username, event => {
    const state = JSON.parse(event.data);
    updateUI(state);
    renderTable(state);
  });
})();

// Кнопка покинуть стол
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
