import { createWebSocket } from './ws.js';

const params   = new URLSearchParams(window.location.search);
const tableId  = params.get('table_id');
const userId   = params.get('user_id');
const username = params.get('username') || userId;

// Контейнеры строго под твою структуру:
const seatsContainer     = document.getElementById('seats');
const communityContainer = document.getElementById('community-cards');
const actionsEl          = document.getElementById('actions');
const leaveBtn           = document.getElementById('leave-btn');
const potAmountEl        = document.querySelector('.pot-amount b') || document.querySelector('.pot-amount');
const pokerTableCont     = document.getElementById('poker-table-container');
const statusEl           = document.getElementById('status');
const currentBetEl       = document.getElementById('current-bet');

// Оверлей результата
const resultOverlayEl = document.getElementById('result-overlay') || (() => {
  const el = document.createElement('div');
  el.id = 'result-overlay';
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
    background: 'rgba(0, 0, 0, 0.8)', color: '#fff', display: 'none',
    alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
    fontFamily: 'sans-serif', fontSize: '18px', zIndex: '1000'
  });
  document.body.appendChild(el);
  return el;
})();

function safeSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// --- UI Update: статусы, кнопки, overlay
function updateUI(state) {
  if (!statusEl || !currentBetEl) return;

  if (state.phase === 'result') {
    resultOverlayEl.innerHTML = '';
    const msg = document.createElement('div');
    msg.style.marginBottom = '20px';
    msg.textContent = Array.isArray(state.winner)
      ? `Split pot: ${state.winner.map(u => state.usernames?.[u] || u).join(', ')}`
      : `Winner: ${state.usernames?.[state.winner] || state.winner}`;
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
    pokerTableCont.style.opacity = '0.22';
    actionsEl.style.display = 'none';
    statusEl.style.display = 'none';
    currentBetEl.style.display = 'none';
    return;
  }

  // Скрыть overlay
  resultOverlayEl.style.display = 'none';
  pokerTableCont.style.opacity = '';
  statusEl.style.display = '';
  currentBetEl.style.display = '';

  if (!state.started) {
    statusEl.textContent     = `Ожидаем игроков… (${state.players_count || 0}/2)`;
    currentBetEl.textContent = '';
    actionsEl.style.display  = 'none';
    return;
  }

  const isMyTurn = String(state.current_player) === String(userId);
  if (!isMyTurn) {
    const nextName = state.usernames?.[state.current_player] || state.current_player;
    statusEl.textContent     = `Ход игрока: ${nextName}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
    actionsEl.style.display  = 'none';
    return;
  }

  // Мой ход: кнопки действий
  statusEl.textContent     = 'Ваш ход';
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet || 0}`;
  actionsEl.style.display  = 'flex';
  actionsEl.innerHTML      = '';

  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;
  const myStack   = state.stacks?.[userId] ?? 0;

  createActionBtn('Fold',   () => safeSend({ user_id: userId, action: 'fold' }), false, 'Fold');
  createActionBtn('Check',  () => safeSend({ user_id: userId, action: 'check' }), toCall !== 0, 'Check');
  createActionBtn('Call',   () => safeSend({ user_id: userId, action: 'call' }), toCall <= 0 || myStack < toCall, toCall > 0 ? `Call ${toCall}` : 'Call');
  createActionBtn('Bet',    () => {
    const amount = parseInt(prompt('Сколько поставить?'), 10) || 0;
    safeSend({ user_id: userId, action: 'bet', amount });
  }, false, 'Bet');
  createActionBtn('Raise',  () => {
    const target = parseInt(prompt(`Рейз до суммы > ${cb}?`), 10) || 0;
    safeSend({ user_id: userId, action: 'raise', amount: target });
  }, toCall <= 0, 'Raise');

  function createActionBtn(name, onClick, disabled, label) {
    const btn = document.createElement('button');
    btn.textContent = label || name;
    btn.className = `poker-action-btn poker-action-${name.toLowerCase()}`;
    if (disabled) btn.disabled = true;
    btn.onclick = onClick;
    actionsEl.appendChild(btn);
  }
}

// --- Рендер игроков и карт (demo/diz структура)
function renderTable(state) {
  if (!seatsContainer || !communityContainer) return;
  seatsContainer.innerHTML = '';
  communityContainer.innerHTML = '';

  // --- Общие карты
  (state.community || []).forEach((card, idx) => {
    const cEl = document.createElement('div');
    cEl.className = 'card';
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    cEl.innerHTML = `<span class="rank">${rank}</span><span class="suit${'♥♦'.includes(suit) ? ' red' : ''}">${suit}</span>`;
    if ('♥♦'.includes(suit)) cEl.classList.add('red');
    communityContainer.appendChild(cEl);
    setTimeout(() => cEl.classList.add('visible'), 90 + idx * 60);
  });

  // --- Игроки вокруг стола (твоя позиция всегда снизу)
  const players = state.players || [];
  const N = players.length;
  const myIdx = players.findIndex(p => String(p.user_id) === String(userId));

  // Места вокруг стола, как в твоём макете
  const seatPercents = [
    [50, 95], [85, 68], [85, 27], [50, 7], [15, 27], [15, 68]
  ];
  function getSeatPositions(N) {
    if (N === 2) return [seatPercents[0], seatPercents[3]];
    if (N === 3) return [seatPercents[0], seatPercents[2], seatPercents[4]];
    if (N === 4) return [seatPercents[0], seatPercents[1], seatPercents[3], seatPercents[5]];
    if (N === 5) return [seatPercents[0], seatPercents[1], seatPercents[2], seatPercents[4], seatPercents[5]];
    return seatPercents.slice(0, N);
  }
  const positions = getSeatPositions(N);

  // Dealer chip
  let dealerChipEl = document.getElementById('dealer-chip-main');
  if (!dealerChipEl) {
    dealerChipEl = document.createElement('div');
    dealerChipEl.className = 'dealer-chip';
    dealerChipEl.id = 'dealer-chip-main';
    dealerChipEl.textContent = 'D';
    pokerTableCont.appendChild(dealerChipEl);
  }
  dealerChipEl.style.display = 'none';

  players.forEach((p, i) => {
    const place = (i - myIdx + N) % N;
    const [px, py] = positions[place];

    const seat = document.createElement('div');
    seat.className = 'seat';
    seat.style.left = px + '%';
    seat.style.top  = py + '%';
    seat.style.transform = 'translate(-50%, -50%)';

    // --- Карты игрока ---
    const cardsEl = document.createElement('div');
    cardsEl.className = 'cards';
    const hole = state.hole_cards?.[p.user_id] || [];
    if (String(p.user_id) === String(userId)) {
      hole.forEach(card => {
        const rk = card.slice(0, -1);
        const st = card.slice(-1);
        const cd = document.createElement('div');
        cd.className = 'card';
        cd.innerHTML = `<span class="rank">${rk}</span><span class="suit${'♥♦'.includes(st) ? ' red' : ''}">${st}</span>`;
        if ('♥♦'.includes(st)) cd.classList.add('red');
        cardsEl.appendChild(cd);
      });
    } else {
      // Рубашка (или 2 скрытые карты)
      for (let k = 0; k < 2; ++k) {
        const cd = document.createElement('div');
        cd.className = 'card back';
        cd.innerHTML = `<span class="pattern"></span>`;
        cardsEl.appendChild(cd);
      }
    }
    seat.appendChild(cardsEl);

    // --- Аватар (можно добавить в будущем) ---
    const avatarEl = document.createElement('div');
    avatarEl.className = 'avatar';
    seat.appendChild(avatarEl);

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

    // --- Дилер ---
    if (typeof state.dealer_index === 'number' && state.dealer_index === i) {
      setTimeout(() => {
        dealerChipEl.style.left = `calc(${px}% + 36px)`;
        dealerChipEl.style.top  = `calc(${py}% - 30px)`;
        dealerChipEl.style.display = 'flex';
      }, 0);
    }

    seatsContainer.appendChild(seat);
  });

  // --- Пот (bank) ---
  if (potAmountEl) {
    if (potAmountEl.tagName === 'B') {
      potAmountEl.innerText = state.pot || 0;
    } else {
      potAmountEl.textContent = state.pot || 0;
    }
  }
}

// --- Глянец (если canvas есть)
function drawGloss() {
  const canvas = document.getElementById('table-gloss');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.globalAlpha = 0.56;
  ctx.strokeStyle = "#fff9";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(canvas.width/2, canvas.height/2, canvas.width*0.48, canvas.height*0.38, 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const grad = ctx.createRadialGradient(canvas.width*0.55, canvas.height*0.22, 14, canvas.width*0.52, canvas.height*0.22, 110);
  grad.addColorStop(0, "#fff8");
  grad.addColorStop(1, "#fff0");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.34;
  ctx.beginPath();
  ctx.ellipse(canvas.width*0.51, canvas.height*0.20, canvas.width*0.16, canvas.height*0.08, -0.24, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}
setTimeout(drawGloss, 190);
window.onresize = drawGloss;

// --- WebSocket и старт рендера ---
let ws = null;
if (window.createWebSocket) {
  ws = createWebSocket(tableId, userId, username, e => {
    const state = JSON.parse(e.data);
    updateUI(state);
    renderTable(state);
  });
} else {
  // Fallback: подключение вручную (если не через import)
  ws = new WebSocket(`wss://${window.location.host}/ws/game/${tableId}?user_id=${userId}&username=${username}`);
  ws.onmessage = evt => {
    const state = JSON.parse(evt.data);
    updateUI(state);
    renderTable(state);
  };
}

// --- Leave ---
if (leaveBtn) {
  leaveBtn.onclick = async () => {
    await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
    window.location.href = 'index.html';
  };
}
