// ui_game.js: Pixel-perfect и адаптив для покерного стола
import { createWebSocket } from './ws.js';

// ======= URL параметры =======
const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// ======= DOM элементы =======
const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

let ws;

// ======= Overlay для результата =======
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

// ======= Утилиты =======
function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getSeatAngles(N) {
  if (N === 2) return [90, -90];
  if (N === 3) return [90, 0, 180];
  if (N === 4) return [90, 0, -90, 180];
  if (N === 5) return [90, 30, -30, -150, 150];
  return [90, 30, -30, -90, -150, 150]; // 6-max или больше
}

// Pixel-perfect размеры для разных экранов
function getTableDims() {
  // Базовый размер (как на демо-скриншоте)
  let vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  let vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  // Для мобильных - делаем стол уже, и ниже
  let isMobile = vw < 600;
  let W = isMobile ? vw * 0.93 : Math.min(vw * 0.68, 1100);
  let H = isMobile ? W * 0.8 : W / 1.38;

  // Центр wrapper'а
  const wrapper = document.getElementById('poker-table-wrapper');
  const wrapperRect = wrapper.getBoundingClientRect();
  const cx = wrapperRect.width / 2;
  const cy = isMobile ? wrapperRect.height * 0.68 : wrapperRect.height / 2;
  return { w: W, h: H, cx, cy, rx: W * 0.43, ry: H * 0.38 };
}

// ======= Основной рендер =======
function renderTable(state) {
  window.currentTableState = state; // для ресайза!
  const seatsContainer = document.getElementById('seats');
  const communityContainer = document.getElementById('community-cards');
  const actionsBlock = document.getElementById('actions');
  seatsContainer.innerHTML = '';
  communityContainer.innerHTML = '';

  // Общие карты
  (state.community || []).forEach((card, idx) => {
    const cEl = document.createElement('div');
    cEl.className = 'card';
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cEl.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suit}</span>`;
    if (suit === '♥' || suit === '♦') cEl.classList.add('red');
    communityContainer.appendChild(cEl);
    setTimeout(() => cEl.classList.add('visible'), 120 + idx * 90);
  });

  // Pixel-perfect геометрия:
  const { w, h, cx, cy, rx, ry } = getTableDims();
  // Сам стол:
  pokerTableEl.style.width  = w + 'px';
  pokerTableEl.style.height = h + 'px';
  pokerTableEl.style.left   = `calc(50% - ${w/2}px)`;
  pokerTableEl.style.top    = `calc(50% - ${h/2}px)`;

  // Для .border и #seats — синхронизируем размеры
  document.getElementById('poker-table-border').style.width  = (w*1.06) + 'px';
  document.getElementById('poker-table-border').style.height = (h*1.08) + 'px';
  document.getElementById('poker-table-border').style.left   = `calc(50% - ${(w*1.06)/2}px)`;
  document.getElementById('poker-table-border').style.top    = `calc(50% - ${(h*1.08)/2}px)`;
  seatsContainer.style.width  = w + 'px';
  seatsContainer.style.height = h + 'px';
  seatsContainer.style.left   = `calc(50% - ${w/2}px)`;
  seatsContainer.style.top    = `calc(50% - ${h/2}px)`;

  // Позиционирование игроков
  const players = state.players || [];
  const holeMap = state.hole_cards || {};
  const userIndex = players.findIndex(p => String(p.user_id) === String(userId));
  const N = players.length;
  const angles = getSeatAngles(N);
  const seatOrder = [];
  for (let i = 0; i < N; ++i) {
    seatOrder.push(angles[(i - userIndex + N) % N]);
  }
  players.forEach((p, i) => {
    const seat = document.createElement('div');
    seat.className = 'seat';
    const rad = seatOrder[i] * Math.PI / 180;
    seat.style.left = (cx + rx * Math.cos(rad)) + 'px';
    seat.style.top  = (cy + ry * Math.sin(rad)) + 'px';
    seat.style.transform = 'translate(-50%, -50%)';
    if (String(p.user_id) === String(userId)) seat.classList.add('my-seat');
    if (String(state.current_player) === String(p.user_id)) seat.classList.add('active');
    // Карты
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    (holeMap[p.user_id] || []).forEach(c => {
      const cd = document.createElement('div');
      cd.className = 'card';
      if (String(p.user_id) === String(userId)) {
        const rk = c.slice(0, -1);
        const st = c.slice(-1);
        cd.innerHTML = `<span class='rank'>${rk}</span><span class='suit'>${st}</span>`;
        if (st === '♥' || st === '♦') cd.classList.add('red');
      } else {
        cd.innerHTML = `<span class='suit'>🂠</span>`;
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
    stackEl.textContent = state.stacks?.[p.user_id] || 0;
    block.appendChild(stackEl);
    seat.appendChild(block);
    seatsContainer.appendChild(seat);
  });

  // --- Дилер чип ---
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
    if (typeof state.dealer_index !== 'undefined' && Number(state.dealer_index) === i) {
      const rad = seatOrder[i] * Math.PI / 180;
      dealerChipEl.style.left = (cx + rx * Math.cos(rad) + 38) + 'px';
      dealerChipEl.style.top  = (cy + ry * Math.sin(rad) - 38) + 'px';
      dealerChipEl.style.display = 'flex';
    }
  });

  // --- Кнопки под своим seat ---
  if (actionsBlock && players.length > 0) {
    const rad = seatOrder[0] * Math.PI / 180;
    actionsBlock.style.left = (cx + rx * Math.cos(rad)) + 'px';
    actionsBlock.style.top  = (cy + ry * Math.sin(rad) + 62) + 'px'; // 62px ниже seat
    actionsBlock.style.position = 'absolute';
    actionsBlock.style.transform = 'translate(-50%, 0)';
    actionsBlock.style.zIndex = 999;
    actionsBlock.style.display = 'flex';
    seatsContainer.appendChild(actionsBlock);
  }
}

// ======= UI и WS =======
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

// ======= WS =======
ws = createWebSocket(tableId, userId, username, e => {
  const state = JSON.parse(e.data);
  updateUI(state);
  renderTable(state);
});
leaveBtn.onclick = async () => {
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  window.location.href = 'index.html';
};

// ======= Pixel-perfect адаптив на resize =======
window.addEventListener('resize', () => {
  if (window.currentTableState) {
    renderTable(window.currentTableState);
  }
});
