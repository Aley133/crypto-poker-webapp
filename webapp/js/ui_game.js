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
  const communityContainer = document.getElementById('community-cards');

  // Очищаем предыдущий рендер
  seatsContainer.innerHTML = '';
  communityContainer.innerHTML = '';

  // 1) Общие карты (борд)
  (state.community || []).forEach(card => {
    const cEl = document.createElement('div');
    cEl.className = 'card';
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cEl.innerHTML = `
      <span class="rank">${rank}</span>
      <span class="suit">${suit}</span>
    `;
    if (suit === '♥' || suit === '♦') cEl.classList.add('red');
    communityContainer.appendChild(cEl);
  });

  // Игроки по кругу
  const players = state.players || [];
  const holeMap = state.hole_cards || {};
  const N = players.length;
  const userIndex = players.findIndex(p => String(p.user_id) === String(userId));

  // Dealer chip (перед игроками, один на всех)
  let dealerChipEl = document.getElementById('dealer-chip-main');
  if (!dealerChipEl) {
    dealerChipEl = document.createElement('div');
    dealerChipEl.className = 'dealer-chip';
    dealerChipEl.id = 'dealer-chip-main';
    dealerChipEl.textContent = 'D';
    seatsContainer.appendChild(dealerChipEl);
  }
  dealerChipEl.style.display = 'none';

  players.forEach((p, i) => {
    const seat = document.createElement('div');
    seat.className = 'seat';

    // 2.1) Круговое позиционирование
    // Первый игрок всегда "внизу", потом против часовой (по покерной классике)
    const place = (i - userIndex + N) % N;
    const angle = (360 / N) * place + 90; // 90 — чтобы 1й игрок был снизу!
    const rad = angle * Math.PI / 180;
    const RADIUS = 42; // радиус в процентах (отцентровать у края)
    const cx = 50, cy = 50;
    const x = cx + RADIUS * Math.cos(rad);
    const y = cy + RADIUS * Math.sin(rad);
    seat.style.position = 'absolute';
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;
    seat.style.transform = 'translate(-50%, -50%)';

    // 2.2) Карты игрока
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    (holeMap[p.user_id] || []).forEach(c => {
      const cd = document.createElement('div');
      cd.className = 'card';
      if (String(p.user_id) === String(userId)) {
        const rk = c.slice(0, -1);
        const st = c.slice(-1);
        cd.innerHTML = `<span class="rank">${rk}</span><span class="suit">${st}</span>`;
        if (st === '♥' || st === '♦') cd.classList.add('red');
      } else {
        cd.classList.add('back');
        cd.innerHTML = `<span class="pattern"></span>`;
      }
      cardsEl.appendChild(cd);
    });
    seat.appendChild(cardsEl);

    // 2.3) Имя и стек игрока
    const infoEl = document.createElement('div');
    infoEl.className = 'player-info';
    infoEl.textContent = p.username;
    seat.appendChild(infoEl);

    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = state.stacks?.[p.user_id] || 0;
    seat.appendChild(stackEl);

    // Вставляем сиденье
    seatsContainer.appendChild(seat);

    // 2.4) Dealer chip — плавно перемещаем
    if (state.dealer_index !== undefined && state.dealer_index === i) {
      setTimeout(() => {
        dealerChipEl.style.left = (seat.offsetLeft - 26) + 'px'; // -26px — левее первой карты
        dealerChipEl.style.top = (seat.offsetTop + 16) + 'px';   // +16px — чуть ниже центра карт
        dealerChipEl.style.display = 'flex';
        dealerChipEl.style.animation = 'dealer-spin 0.7s';
        dealerChipEl.addEventListener('animationend', () => {
          dealerChipEl.style.animation = '';
        }, { once: true });
      }, 0);
    }

    // 2.5) Экшен bubble (action)
    const action = state.player_actions?.[p.user_id];
    if (action) {
      const actionEl = document.createElement('div');
      actionEl.className = 'player-action ' + action.type;
      actionEl.textContent = (action.type === 'bet' || action.type === 'raise')
        ? `${action.type.toUpperCase()} ${action.amount}`
        : action.type.toUpperCase();
      seat.appendChild(actionEl);
      setTimeout(() => actionEl.classList.add('fadeout'), 1200);
      setTimeout(() => actionEl.remove(), 1800);
    }
  });
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
