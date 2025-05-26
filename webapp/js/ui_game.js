import { createWebSocket } from './ws.js';

const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');
const seatsContainer = document.getElementById('seats');

// Overlay для результата раздачи
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

// Обновление UI-элементов (статус, кнопки, оверлей)
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

// ---------- Визуальная посадка игроков, стол, дилер, кнопки ----------

function renderTable(state) {
  const seatsContainer = document.getElementById('seats');
  const pokerTableWrapper = document.getElementById('poker-table-wrapper');
  const actionsBlock = document.getElementById('actions');
  seatsContainer.innerHTML = '';

  // Карты борда, пот и т.д. — не трогаем, только посадка
  const players = state.players || [];
  const N = players.length;
  const myIdx = players.findIndex(p => String(p.user_id) === String(userId));
  if (myIdx === -1) return;

  // ВСЁ позиционируем относительно #poker-table-wrapper, не таблицы!
  const rect = pokerTableWrapper.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  // Эллипс — еще шире и выше, чтобы сидели за столом!
  const RADIUS_X = rect.width * 0.45;
  const RADIUS_Y = rect.height * 0.41;

  let mySeatRect = null;
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
    const place = (i - myIdx + N) % N;
    const angle = ((360 / N) * place - 90) * (Math.PI / 180);
    const x = centerX + RADIUS_X * Math.cos(angle);
    const y = centerY + RADIUS_Y * Math.sin(angle);

    const seat = document.createElement('div');
    seat.className = 'seat';
    if (String(p.user_id) === String(userId)) seat.classList.add('my-seat');
    if (state.current_player === p.user_id) seat.classList.add('active');
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;
    seat.style.transform = 'translate(-50%, -50%)';

    // Карты
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

    // Имя и стек
    const block = document.createElement('div');
    block.className = 'seat-block';
    const infoEl = document.createElement('div');
    infoEl.className = 'player-info';
    infoEl.textContent = p.username || p.name || p.user_id;
    block.appendChild(infoEl);
    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = state.stacks?.[p.user_id] || 0;
    block.appendChild(stackEl);
    seat.appendChild(block);

    // Если нужен dealer chip
    if (state.dealer_index !== undefined && state.dealer_index === i) {
      setTimeout(() => {
        dealerChipEl.style.left = (x + 36) + 'px';
        dealerChipEl.style.top = (y - 36) + 'px';
        dealerChipEl.style.display = 'flex';
      }, 0);
    }
    if (String(p.user_id) === String(userId)) {
      mySeatRect = seat.getBoundingClientRect();
    }
    seatsContainer.appendChild(seat);
  });

  // Кнопки строго под своим seat
  if (actionsBlock && mySeatRect) {
    const containerRect = seatsContainer.getBoundingClientRect();
    actionsBlock.style.position = "absolute";
    actionsBlock.style.left = (mySeatRect.left - containerRect.left + mySeatRect.width / 2) + "px";
    actionsBlock.style.top = (mySeatRect.bottom - containerRect.top + 10) + "px";
    actionsBlock.style.transform = "translate(-50%, 0)";
    actionsBlock.style.zIndex = 99;
    actionsBlock.style.display = "flex";
    seatsContainer.appendChild(actionsBlock);
  }
}

// ---------- WS + event handlers ----------

let ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});

leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
