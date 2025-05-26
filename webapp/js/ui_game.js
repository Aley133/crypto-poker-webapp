

// URL parameters
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// DOM elements
const statusEl     = document.getElementById('status');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');
const tableIdEl    = document.getElementById('table-id');

let ws;

// Overlay для отображения результата раздачи
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

function updateUI(state) {
  // Показываем tableId
  if (tableIdEl && tableId) tableIdEl.textContent = tableId;

  // Обновляем банк (новый layout: .pot-amount > b)
  const potEl = document.getElementById('pot') || document.getElementById('pot-on-table');
if (potEl) {
    // Для совместимости: если есть pot-amount, обновим только число в нем
    if (potEl.querySelector('#pot-amount') || potEl.querySelector('.pot-amount')) {
        const amt = potEl.querySelector('#pot-amount') || potEl.querySelector('.pot-amount b') || potEl.querySelector('.pot-amount');
        if (amt) amt.textContent = state.pot || 0;
    } else {
        potEl.textContent = `Пот: ${state.pot || 0}`;
    }
}

  if (state.phase === 'result') {
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
    pokerTableEl.style.display    = 'none';
    actionsEl.style.display       = 'none';
    if (statusEl) statusEl.style.display = 'none';
    if (potAmountEl) potAmountEl.style.display = 'none';
    if (currentBetEl) currentBetEl.style.display = 'none';
    return;
  }

  // Скрываем оверлей результата
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  if (statusEl) statusEl.style.display = '';
  if (potAmountEl) potAmountEl.style.display = '';
  if (currentBetEl) currentBetEl.style.display = '';

  if (!state.started) {
    if (statusEl) statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    if (potAmountEl) potAmountEl.textContent = '';
    if (currentBetEl) currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    if (statusEl) statusEl.textContent = `Ход игрока: ${nextName}`;
    if (potAmountEl) potAmountEl.textContent = state.pot || 0;
    if (currentBetEl) currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  // Мой ход: показываем кнопки
  if (statusEl) statusEl.textContent = 'Ваш ход';
  if (potAmountEl) potAmountEl.textContent = state.pot || 0;
  if (currentBetEl) currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  actionsEl.style.display  = 'flex';
  actionsEl.innerHTML      = '';

  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  // Action buttons — теперь со стилями из table.css
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.classList.add('poker-action-btn', 'poker-action-fold');
  btnFold.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(btnFold);

  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.classList.add('poker-action-btn', 'poker-action-check');
  btnCheck.disabled    = toCall !== 0;
  btnCheck.onclick     = () => safeSend({ user_id: userId, action: 'check' });
  actionsEl.appendChild(btnCheck);

  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.classList.add('poker-action-btn', 'poker-action-call');
  btnCall.disabled    = toCall <= 0 || myStack < toCall;
  btnCall.onclick     = () => safeSend({ user_id: userId, action: 'call' });
  actionsEl.appendChild(btnCall);

  const btnBet = document.createElement('button');
  btnBet.textContent = 'Bet';
  btnBet.classList.add('poker-action-btn', 'poker-action-bet');
  btnBet.onclick     = () => {
    const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount });
  };
  actionsEl.appendChild(btnBet);

  const btnRaise = document.createElement('button');
  btnRaise.textContent = 'Raise';
  btnRaise.classList.add('poker-action-btn', 'poker-action-raise');
  btnRaise.disabled    = toCall <= 0;
  btnRaise.onclick     = () => {
    const target = parseInt(prompt(`Рейз до суммы > ${cb}?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: target });
  };
  actionsEl.appendChild(btnRaise);
}

function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderTable(state) {
  const seatsContainer     = document.getElementById('seats');
  const communityContainer = document.getElementById('community-cards');
  if (!seatsContainer || !communityContainer) return;
  seatsContainer.innerHTML = '';
  communityContainer.innerHTML = '';

  // 1. Отрисовать общие карты
  (state.community || []).forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    // Разбиваем код карты на ранг и масть
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cardEl.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suit}</span>`;
    // Помечаем красные масти
    if (suit === '♥' || suit === '♦') {
      cardEl.classList.add('red');
    }
    // Если используем анимацию появления, сразу делаем карты видимыми:
    cardEl.classList.add('visible');
    communityContainer.appendChild(cardEl);
  });

  // 2. Отрисовать игроков за столом
  const players = state.players || [];
  const holeCards = state.hole_cards || {};
  // Вычисляем индекс текущего пользователя в списке (если список хранит объекты или ID)
  const userIndex = players.findIndex(p => String((p.user_id||p)) === String(userId));
  players.forEach((p, i) => {
    const playerId = (typeof p === 'object') ? p.user_id : p;  // поддержка формата ID или объекта
    const seat = document.createElement('div');
    seat.className = 'seat';
    // Относительный индекс для позиционирования (текущий игрок -> pos 1)
    let relIndex = i;
    if (userIndex >= 0 && players.length > 1) {
      relIndex = (i - userIndex + players.length) % players.length;
    }
    seat.dataset.pos = String(relIndex + 1);

    // Карты игрока (если есть)
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    (holeCards[playerId] || []).forEach(card => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'card';
      if (String(playerId) === String(userId)) {
        // Для своих карт отображаем ранг/масть
        const rk = card.slice(0, -1);
        const st = card.slice(-1);
        cardDiv.innerHTML = `<span class="rank">${rk}</span><span class="suit">${st}</span>`;
        if (st === '♥' || st === '♦') cardDiv.classList.add('red');
      } else {
        // Чужие карты – рубашкой (скрыты)
        cardDiv.innerHTML = `<span class="suit">🂠</span>`;
      }
      cardsEl.appendChild(cardDiv);
    });
    seat.appendChild(cardsEl);

    // Имя игрока
    const infoEl = document.createElement('div');
    infoEl.className = 'player-info';
    infoEl.textContent = state.usernames?.[playerId] || playerId;
    seat.appendChild(infoEl);

    // Стек игрока
    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = state.stacks?.[playerId] ?? 0;
    seat.appendChild(stackEl);

    seatsContainer.appendChild(seat);
  });
}

// Инициализация WebSocket
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});

// Leave button
if (leaveBtn) {
  leaveBtn.onclick = async () => {
    await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
    window.location.href = 'index.html';
  };
}
