import { createWebSocket } from './ws.js';

// URL parameters
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

// Обновление базовых UI-элементов (статус, кнопки, оверлей)
function updateUI(state) {
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
    statusEl.style.display        = 'none';
    potEl.style.display           = 'none';
    currentBetEl.style.display    = 'none';
    return;
  }

  // Скрываем оверлей результата
  resultOverlayEl.style.display = 'none';
  pokerTableEl.style.display    = '';
  statusEl.style.display        = '';
  potEl.style.display           = '';
  currentBetEl.style.display    = '';

  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    potEl.textContent        = '';
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  if (!isMyTurn) {
    const nextName = state.usernames[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  // Мой ход: показываем кнопки
  statusEl.textContent     = 'Ваш ход';
  potEl.textContent        = `Пот: ${state.pot || 0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  actionsEl.style.display  = 'flex';
  actionsEl.innerHTML      = '';

  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.onclick     = () => safeSend({ user_id: userId, action: 'fold' });
  actionsEl.appendChild(btnFold);

  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.disabled    = toCall !== 0;
  btnCheck.onclick     = () => safeSend({ user_id: userId, action: 'check' });
  actionsEl.appendChild(btnCheck);

  const btnCall = document.createElement('button');
  btnCall.textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnCall.disabled    = toCall <= 0 || myStack < toCall;
  btnCall.onclick     = () => safeSend({ user_id: userId, action: 'call' });
  actionsEl.appendChild(btnCall);

  const btnBet = document.createElement('button');
  btnBet.textContent = 'Bet';
  btnBet.onclick     = () => {
    const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount });
  };
  actionsEl.appendChild(btnBet);

  const btnRaise = document.createElement('button');
  btnRaise.textContent = 'Raise';
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
  const seatsContainer = document.getElementById('seats');
  const pokerTable = document.getElementById('poker-table');
  const actionsBlock = document.getElementById('actions');
  seatsContainer.innerHTML = '';

  // Общие карты (флоп, терн, ривер)
  const communityContainer = document.getElementById('community-cards');
  communityContainer.innerHTML = '';
  (state.community || []).forEach((card, idx) => {
    const cEl = document.createElement('div');
    cEl.className = 'card';
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cEl.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suit}</span>`;
    if ('♥♦'.includes(suit) || 'hd'.includes(suit)) cEl.classList.add('red');
    communityContainer.appendChild(cEl);
    setTimeout(() => cEl.classList.add('visible'), 120 + idx * 90);
  });

  // Ключевые точки (проценты по эллипсу, 6-max стиль)
  const seatPercents = [
    [50, 96],    // Ты (снизу)
    [96, 50],    // Справа
    [81, 17],    // Верх-право
    [50, 5],     // Верх-центр
    [19, 17],    // Верх-лево
    [4, 50],     // Слева
  ];
  function getSeatPositions(N) {
    if (N === 2) return [seatPercents[0], seatPercents[3]];
    if (N === 3) return [seatPercents[0], seatPercents[2], seatPercents[4]];
    if (N === 4) return [seatPercents[0], seatPercents[1], seatPercents[3], seatPercents[5]];
    if (N === 5) return [seatPercents[0], seatPercents[1], seatPercents[2], seatPercents[4], seatPercents[5]];
    return seatPercents.slice(0, N);
  }

  const N = state.players.length;
  const myIdx = state.players.findIndex(p => p.user_id === state.user_id);
  const positions = getSeatPositions(N);

  // Дилер чип (создаём один раз)
  let dealerChipEl = document.getElementById('dealer-chip-main');
  if (!dealerChipEl) {
    dealerChipEl = document.createElement('div');
    dealerChipEl.className = 'dealer-chip';
    dealerChipEl.id = 'dealer-chip-main';
    dealerChipEl.textContent = 'D';
    seatsContainer.appendChild(dealerChipEl);
  }
  dealerChipEl.style.display = 'none';

  // Рендерим игроков вокруг стола
  state.players.forEach((p, i) => {
    // place=0 — всегда твой seat снизу
    const place = (i - myIdx + N) % N;
    const [px, py] = positions[place];
    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.dataset.uid = p.user_id;

    if (i === myIdx) seat.classList.add('my-seat');
    if (state.current_player === String(i) || state.current_player === p.user_id) seat.classList.add('active');

    // Абсолютное позиционирование по эллипсу
    seat.style.position = 'absolute';
    seat.style.left = px + '%';
    seat.style.top = py + '%';
    seat.style.transform = 'translate(-50%, -50%)';

    // Аватар
    const avatarEl = document.createElement('div');
    avatarEl.className = 'avatar';
    avatarEl.style.backgroundImage = p.avatar ? `url('${p.avatar}')` : '';
    avatarEl.style.width = '32px';
    avatarEl.style.height = '32px';
    seat.appendChild(avatarEl);

    // Карты
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    (state.hole_cards[p.user_id] || []).forEach(c => {
      const cd = document.createElement('div');
      cd.className = 'card';
      if (c === '??') {
        cd.classList.add('back');
        cd.innerHTML = `<span class="pattern"></span>`;
      } else {
        const rk = c.slice(0, -1);
        const st = c.slice(-1);
        cd.innerHTML = `<span class="rank">${rk}</span><span class="suit">${st}</span>`;
        if ('♥♦'.includes(st) || 'hd'.includes(st)) cd.classList.add('red');
      }
      cardsEl.appendChild(cd);
    });
    seat.appendChild(cardsEl);

    // Имя и стек
    const block = document.createElement('div');
    block.className = 'seat-block';
    const infoEl = document.createElement('div');
    infoEl.className = 'player-info';
    infoEl.textContent = p.username;
    block.appendChild(infoEl);
    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = state.stacks[p.user_id];
    block.appendChild(stackEl);
    seat.appendChild(block);

    // Дилерская фишка
    if (
      state.dealer_index === i ||
      state.dealer_index === p.user_id
    ) {
      setTimeout(() => {
        dealerChipEl.style.left = `calc(${px}% + 28px)`;
        dealerChipEl.style.top = `calc(${py}% - 25px)`;
        dealerChipEl.style.display = 'flex';
      }, 0);
    }

    seatsContainer.appendChild(seat);
  });

  // Кнопки строго под своим seat
  if (actionsBlock && positions[0]) {
    actionsBlock.style.position = "absolute";
    actionsBlock.style.left = positions[0][0] + '%';
    actionsBlock.style.top = (positions[0][1] + 12) + '%';
    actionsBlock.style.transform = "translate(-50%, 0)";
    actionsBlock.style.zIndex = 999;
    actionsBlock.style.display = "flex";
    // Не нужно appendChild, actions уже есть в DOM!
  }
}

// Инициализация WebSocket
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});

// Leave button
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
