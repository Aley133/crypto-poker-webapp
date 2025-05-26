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

// --- UI: статус/кнопки/оверлей ---
function updateUI(state) {
  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.marginBottom = '20px';
    if (Array.isArray(state.winner)) {
      msg.textContent = `Split pot: ${state.winner.map(u => state.usernames?.[u] || u).join(', ')}`;
    } else {
      msg.textContent = `Winner: ${state.usernames?.[state.winner] || state.winner}`;
    }
    resultOverlayEl.appendChild(msg);

    const handsDiv = document.createElement('div');
    for (const [uid, cards] of Object.entries(state.revealed_hands || {})) {
      const p = document.createElement('div');
      p.textContent = `${state.usernames?.[uid] || uid}: ${cards.join(' ')}`;
      handsDiv.appendChild(p);
    }
    resultOverlayEl.appendChild(handsDiv);

    if (state.split_pots) {
      const splitDiv = document.createElement('div');
      splitDiv.style.marginTop = '20px';
      splitDiv.textContent = 'Payouts: ' +
        Object.entries(state.split_pots)
          .map(([uid, amt]) => `${state.usernames?.[uid] || uid}: ${amt}`)
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
    const nextName = state.usernames?.[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  // Мой ход: кнопки экшенов
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

  createActionBtn('Fold',   () => safeSend({ user_id: userId, action: 'fold' }));
  createActionBtn('Check',  () => safeSend({ user_id: userId, action: 'check' }), toCall !== 0);
  createActionBtn('Call',   () => safeSend({ user_id: userId, action: 'call' }), toCall <= 0 || myStack < toCall, toCall > 0 ? `Call ${toCall}` : 'Call');
  createActionBtn('Bet',    () => {
    const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount });
  });
  createActionBtn('Raise',  () => {
    const target = parseInt(prompt(`Рейз до суммы > ${cb}?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: target });
  }, toCall <= 0);

  function createActionBtn(name, onClick, disabled, label) {
    const btn = document.createElement('button');
    btn.textContent = label || name;
    btn.className = `poker-action-btn poker-action-${name.toLowerCase()}`;
    if (disabled) btn.disabled = true;
    btn.onclick = onClick;
    actionsEl.appendChild(btn);
  }
}

// --- Полностью адаптивное позиционирование и современная отрисовка ---
function renderTable(state) {
  const seatsContainer = document.getElementById('seats');
  const pokerTable     = document.getElementById('poker-table');
  const actionsBlock   = document.getElementById('actions');
  const communityContainer = document.getElementById('community-cards');
  seatsContainer.innerHTML = '';
  communityContainer.innerHTML = '';

  // 1) Общие карты
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

  // 2) Координаты/позиции игроков
  const players = state.players || [];
  const N = players.length;
  const myIdx = players.findIndex(p => String(p.user_id) === String(userId));

  const seatPercents = [
    [50, 96], [96, 50], [81, 17], [50, 5], [19, 17], [4, 50]
  ];
  function getSeatPositions(N) {
    if (N === 2) return [seatPercents[0], seatPercents[3]];
    if (N === 3) return [seatPercents[0], seatPercents[2], seatPercents[4]];
    if (N === 4) return [seatPercents[0], seatPercents[1], seatPercents[3], seatPercents[5]];
    if (N === 5) return [seatPercents[0], seatPercents[1], seatPercents[2], seatPercents[4], seatPercents[5]];
    return seatPercents.slice(0, N);
  }
  const positions = getSeatPositions(N);

  let mySeatRect = null;
  // Dealer chip
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
    // Твоё место — всегда снизу
    const place = (i - myIdx + N) % N;
    const [px, py] = positions[place];
    const seat = document.createElement('div');
    seat.className = 'seat';
    if (i === myIdx) seat.classList.add('my-seat');
    if (state.current_player === String(p.user_id)) seat.classList.add('active');
    seat.style.position = 'absolute';
    seat.style.left = px + '%';
    seat.style.top = py + '%';
    seat.style.transform = 'translate(-50%, -50%)';
    // Можно добавить avatar, если есть (по желанию)
    if (p.avatar) {
      const avatarEl = document.createElement('div');
      avatarEl.className = 'avatar';
      avatarEl.style.backgroundImage = `url('${p.avatar}')`;
      avatarEl.style.width = '32px';
      avatarEl.style.height = '32px';
      seat.appendChild(avatarEl);
    }
    // Карты
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    const hole = state.hole_cards?.[p.user_id] || [];
    if (String(p.user_id) === String(userId)) {
      hole.forEach(card => {
        const rk = card.slice(0, -1);
        const st = card.slice(-1);
        const cd = document.createElement('div');
        cd.className = 'card';
        cd.innerHTML = `<span class="rank">${rk}</span><span class="suit">${st}</span>`;
        if ('♥♦'.includes(st)) cd.classList.add('red');
        cardsEl.appendChild(cd);
      });
    } else {
      hole.forEach(_ => {
        const cd = document.createElement('div');
        cd.className = 'card back';
        cd.innerHTML = `<span class="pattern"></span>`;
        cardsEl.appendChild(cd);
      });
    }
    seat.appendChild(cardsEl);
    // Имя и стек — seat-block
    const block = document.createElement('div');
    block.className = 'seat-block';
    const infoEl = document.createElement('div');
    infoEl.className = 'player-info';
    infoEl.textContent = p.username;
    block.appendChild(infoEl);
    const stackEl = document.createElement('div');
    stackEl.className = 'player-stack';
    stackEl.textContent = state.stacks?.[p.user_id] || 0;
    block.appendChild(stackEl);
    seat.appendChild(block);

    // Дилер чип
    if (state.dealer_index === i) {
      setTimeout(() => {
        dealerChipEl.style.left = `calc(${px}% + 28px)`;
        dealerChipEl.style.top  = `calc(${py}% - 25px)`;
        dealerChipEl.style.display = 'flex';
      }, 0);
    }
    if (i === myIdx) mySeatRect = seat.getBoundingClientRect();
    seatsContainer.appendChild(seat);
  });

  // Кнопки строго под своим seat
  if (actionsBlock && mySeatRect) {
    actionsBlock.style.position = "absolute";
    actionsBlock.style.left = positions[0][0] + '%';
    actionsBlock.style.top = (positions[0][1] + 12) + '%';
    actionsBlock.style.transform = "translate(-50%, 0)";
    actionsBlock.style.zIndex = 999;
    actionsBlock.style.display = "flex";
    seatsContainer.appendChild(actionsBlock);
  }

  // Обновить pot (id="pot-amount" в новом дизайне)
  const potAmountEl = document.getElementById('pot-amount');
  if (potAmountEl) potAmountEl.textContent = state.pot || 0;
}

// Глянец и подсветка (опционально, если есть canvas)
function drawGloss() {
  const c = document.getElementById('table-gloss');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);

  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.strokeStyle = "#fff9";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(c.width/2, c.height/2, c.width*0.46, c.height*0.34, 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const grad = ctx.createRadialGradient(c.width*0.52, c.height*0.23, 12, c.width*0.52, c.height*0.22, 120);
  grad.addColorStop(0, "#fff6");
  grad.addColorStop(1, "#fff0");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.38;
  ctx.beginPath();
  ctx.ellipse(c.width*0.52, c.height*0.23, c.width*0.18, c.height*0.08, -0.24, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}
setTimeout(drawGloss, 180);
window.onresize = drawGloss;

// Инициализация WebSocket
let ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});

// Leave button
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};
