// Poker Table Responsive Layout Fix
import { createWebSocket } from './ws.js';

// --- Params ---
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
const borderEl     = document.getElementById('poker-table-border');
const wrapperEl    = document.getElementById('poker-table-wrapper');
const seatsEl      = document.getElementById('seats');

let ws;

// Overlay for results
const resultOverlayEl = document.createElement('div');
resultOverlayEl.id = 'result-overlay';
Object.assign(resultOverlayEl.style, {
  position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
  background: 'rgba(0, 0, 0, 0.8)', color: '#fff', display: 'none',
  alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
  fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
});
document.body.appendChild(resultOverlayEl);

function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getSeatAngles(N) {
  if (N === 2) return [90, 270];
  if (N === 3) return [90, 210, 330];
  if (N === 4) return [90, 180, 270, 0];
  if (N === 5) return [90, 162, 234, 306, 18];
  let out = [];
  for (let i = 0; i < N; ++i) out.push(90 + (360 / N) * i);
  return out;
}

function getTableDims() {
  // Используй ширину и высоту wrapper, сохраняя соотношение!
  const wrapper = document.getElementById('poker-table-wrapper');
  const W = wrapper.offsetWidth;
  const H = wrapper.offsetHeight;
  // Овальный стол: ширина ~75% экрана, высота с правильным соотношением
  let w = Math.min(W * 0.75, 980); // ширина стола
  let h = w * 0.82;                // высота (соотношение 75:62)
  // Центр wrapper — cx, cy
  const cx = W / 2, cy = H / 2;
  return { w, h, cx, cy, rx: w * 0.49, ry: h * 0.46 };
}


function layoutTable() {
  const { w, h, cx, cy } = getTableDims();
  // Переопределить размеры всех блоков!
  ['poker-table', 'poker-table-border', 'seats'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = '50%';
    el.style.top = '50%';
    el.style.transform = 'translate(-50%, -50%)';
  });
}

window.addEventListener('resize', layoutTable);
window.addEventListener('DOMContentLoaded', layoutTable);

function renderTable(state) {
  seatsEl.innerHTML = '';
  const communityEl = document.getElementById('community-cards');
  communityEl.innerHTML = '';

  (state.community || []).forEach((card, idx) => {
    const cEl = document.createElement('div');
    cEl.className = 'card';
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cEl.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suit}</span>`;
    if (suit === '♥' || suit === '♦') cEl.classList.add('red');
    communityEl.appendChild(cEl);
    setTimeout(() => cEl.classList.add('visible'), 120 + idx * 90);
  });

  // Table/border/seats layout
  const { w, h, cx, cy, rx, ry } = getTableDims();
  // Set table style (relative to wrapper!)
  pokerTableEl.style.position = 'absolute';
  pokerTableEl.style.width  = w + 'px';
  pokerTableEl.style.height = h + 'px';
  pokerTableEl.style.left   = (cx - w/2) + 'px';
  pokerTableEl.style.top    = (cy - h/2) + 'px';
  borderEl.style.position = 'absolute';
  borderEl.style.width  = (w * 1.08) + 'px';
  borderEl.style.height = (h * 1.10) + 'px';
  borderEl.style.left   = (cx - w*1.08/2) + 'px';
  borderEl.style.top    = (cy - h*1.10/2) + 'px';
  seatsEl.style.position = 'absolute';
  seatsEl.style.width  = w + 'px';
  seatsEl.style.height = h + 'px';
  seatsEl.style.left   = (cx - w/2) + 'px';
  seatsEl.style.top    = (cy - h/2) + 'px';

  // Player positioning
  const players = state.players || [];
  const holeMap = state.hole_cards || {};
  const userIndex = players.findIndex(p => String(p.user_id) === String(userId));
  const N = players.length;
  const angles = getSeatAngles(N);
  const seatOrder = [];
  for (let i = 0; i < N; ++i) seatOrder.push(angles[(i - userIndex + N) % N]);
  players.forEach((p, i) => {
    const seat = document.createElement('div');
    seat.className = 'seat';
    const rad = seatOrder[i] * Math.PI / 180;
    seat.style.left = (cx + rx * Math.cos(rad)) + 'px';
    seat.style.top  = (cy + ry * Math.sin(rad)) + 'px';
    seat.style.transform = 'translate(-50%, -50%)';
    if (String(p.user_id) === String(userId)) seat.classList.add('my-seat');
    if (String(state.current_player) === String(p.user_id)) seat.classList.add('active');
    // --- Карты ---
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
    // --- Имя и стек ---
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
    seatsEl.appendChild(seat);
  });
  // Dealer chip (по месту дилера)
  let dealerChipEl = document.getElementById('dealer-chip-main');
  if (!dealerChipEl) {
    dealerChipEl = document.createElement('div');
    dealerChipEl.className = 'dealer-chip';
    dealerChipEl.id = 'dealer-chip-main';
    dealerChipEl.textContent = 'D';
    seatsEl.appendChild(dealerChipEl);
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
  // Кнопки действий (под своим seat)
  if (actionsEl && players.length > 0) {
    const rad = seatOrder[0] * Math.PI / 180;
    actionsEl.style.left = (cx + rx * Math.cos(rad)) + 'px';
    actionsEl.style.top  = (cy + ry * Math.sin(rad) + 62) + 'px';
    actionsEl.style.position = 'absolute';
    actionsEl.style.transform = 'translate(-50%, 0)';
    actionsEl.style.zIndex = 999;
    actionsEl.style.display = 'flex';
    seatsEl.appendChild(actionsEl);
  }
}

// Остальные функции updateUI, ws init и т.д. оставить как есть
// (!) Главное — теперь table и border жёстко центрируются в wrapper
// (!) seats и все игроки будут гарантированно в "орбите" и не вылетят за экран


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
// На resize — пересчитать!
window.addEventListener('resize', () => {
  if (window.currentTableState) renderTable(window.currentTableState);
});
