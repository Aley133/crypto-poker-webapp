const N_SEATS = 6;

// Углы для 6 мест (seat 0 внизу по центру)
function getSeatAngles(N) {
  if (N === 6) return [90, 150, 210, 270, 330, 30];
  let out = [];
  for (let i = 0; i < N; ++i) out.push(90 + (360 / N) * i);
  return out;
}

const BORDER_OFFSET = 95;
function getTableDims() {
  const table = document.getElementById('poker-table');
  const W = table.offsetWidth;
  const H = table.offsetHeight;
  const cx = W / 2, cy = H / 2;
  return {
    cx, cy,
    rx: W * 0.44 + BORDER_OFFSET,
    ry: H * 0.41 + BORDER_OFFSET
  };
}

// Главная функция рендера стола и мест
export function renderTable(tableState, userId) {
  const state = tableState;
  const pokerTableEl = document.getElementById('poker-table');
  const borderEl     = document.getElementById('poker-table-border');
  const wrapperEl    = document.getElementById('poker-table-wrapper');
  const seatsEl      = document.getElementById('seats');
  const communityEl  = document.getElementById('community-cards');

  // Очистка
  seatsEl.innerHTML = '';
  communityEl.innerHTML = '';

  // Общие карты
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

  // Размеры и центр
  const { cx, cy, rx, ry } = getTableDims();

  // Подготовим массив мест: seatId => игрок
  const players = state.players || [];
  const seatsMap = Array(N_SEATS).fill(null);
  players.forEach(p => {
    if (typeof p.seat !== "undefined" && p.seat >= 0 && p.seat < N_SEATS)
      seatsMap[p.seat] = p;
  });

  const angles = getSeatAngles(N_SEATS);

  // Определяем seat дилера (если есть)
  let dealerSeat = null;
  if (typeof state.dealer_index === "number") {
    const dealerPlayer = players[state.dealer_index];
    if (dealerPlayer && typeof dealerPlayer.seat !== "undefined") {
      dealerSeat = dealerPlayer.seat;
    }
  }

  // Рисуем 6 мест
  for (let seatId = 0; seatId < N_SEATS; ++seatId) {
    const rad = angles[seatId] * Math.PI / 180;
    const left = cx + rx * Math.cos(rad);
    const top  = cy + ry * Math.sin(rad);

    const seatDiv = document.createElement('div');
    seatDiv.className = 'seat';
    seatDiv.style.position = 'absolute';
    seatDiv.style.left = left + 'px';
    seatDiv.style.top = top + 'px';
    seatDiv.style.transform = 'translate(-50%, -50%)';

    // Дилер чип (отрисовывается даже если seat пустой)
    if (dealerSeat === seatId) {
      const dealerChip = document.createElement('div');
      dealerChip.className = 'dealer-chip';
      dealerChip.textContent = 'D';
      seatDiv.appendChild(dealerChip);
    }

    const player = seatsMap[seatId];
    if (player) {
      // Место занято — игрок
      if (String(player.user_id) === String(userId)) seatDiv.classList.add('my-seat');
      if (String(state.current_player) === String(player.user_id)) seatDiv.classList.add('active');

      // Карты игрока
      const cardsEl = document.createElement('div');
      cardsEl.className = 'cards';
      (state.hole_cards?.[player.user_id] || []).forEach(c => {
        const cd = document.createElement('div');
        cd.className = 'card';
        if (String(player.user_id) === String(userId)) {
          const rk = c.slice(0, -1);
          const st = c.slice(-1);
          cd.innerHTML = `<span class="rank">${rk}</span><span class="suit">${st}</span>`;
          if (st === '♥' || st === '♦') cd.classList.add('red');
        } else {
          cd.innerHTML = `<span class="suit">🂠</span>`;
        }
        cardsEl.appendChild(cd);
      });
      seatDiv.appendChild(cardsEl);

      // Имя и стек
      const block = document.createElement('div');
      block.className = 'seat-block';
      const infoEl = document.createElement('div');
      infoEl.className = 'player-info';
      infoEl.textContent = player.username;
      block.appendChild(infoEl);

      const stackEl = document.createElement('div');
      stackEl.className = 'player-stack';
      stackEl.textContent = state.stacks?.[player.user_id] || 0;
      block.appendChild(stackEl);

      seatDiv.appendChild(block);
    } else {
      // Место пустое — кнопка SIT
      seatDiv.classList.add('empty');
      const sitBtn = document.createElement('button');
      sitBtn.className = 'sit-btn';
      sitBtn.textContent = 'SIT';
      sitBtn.onclick = () => joinSeat(seatId);
      seatDiv.appendChild(sitBtn);
    }

    seatsEl.appendChild(seatDiv);
  }
}

// Сажаем игрока на место (используем глобальные window.currentTableId/ currentUserId)
function joinSeat(seatId) {
  fetch(
    `/api/join-seat?table_id=${window.currentTableId}&user_id=${window.currentUserId}&seat=${seatId}`,
    { method: 'POST' }
  ).then(() => {
    reloadGameState();
  });
}

// На resize — перерисовка
window.addEventListener('resize', () => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
});

// Первый запуск — доп. таймаут для Telegram WebView/медленных девайсов
setTimeout(() => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
}, 200);

// (Все хотфиксы типа safeRenderTable и setTimeout → renderTable(state, userId) — убраны)
