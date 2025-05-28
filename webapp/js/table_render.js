const N_SEATS = 6;

// Углы для 6 мест, 0 — всегда снизу по центру, по часовой стрелке
function getSeatAngles(N) {
  return [90, 150, 210, 270, 330, 30];
}

// Получаем размеры и центр стола
function getTableDims() {
  const table = document.getElementById('poker-table');
  const W = table.offsetWidth;
  const H = table.offsetHeight;
  const cx = W / 2, cy = H / 2;
  return {
    cx, cy,
    rx: W * 0.48, // 0.48 чтобы игроки были прям у борта, но вне овала
    ry: H * 0.48
  };
}

// Главная функция рендера стола и мест
function renderTable(state, userId) {
  const seatsEl = document.getElementById('seats');
  seatsEl.innerHTML = '';

  const { cx, cy, rx, ry } = getTableDims();
  const angles = getSeatAngles(N_SEATS);

  // Формируем отображение: кто сидит где (seatMap[seatId] = {...})
  const seatMap = Array(N_SEATS).fill(null);
  if (state.players) {
    state.players.forEach(p => {
      // Предполагаем p.seat — seatId (0..5), p.user_id, p.username
      if (typeof p.seat === 'number') seatMap[p.seat] = p;
    });
  }

  // Дилер
  let dealerSeat = null;
  if (typeof state.dealer_index === 'number') {
    const dealerPlayer = state.players?.[state.dealer_index];
    if (dealerPlayer && typeof dealerPlayer.seat === "number") {
      dealerSeat = dealerPlayer.seat;
    }
  }

  for (let seatId = 0; seatId < N_SEATS; ++seatId) {
    const rad = angles[seatId] * Math.PI / 180;
    const left = cx + rx * Math.cos(rad);
    const top  = cy + ry * Math.sin(rad);

    const seatDiv = document.createElement('div');
    seatDiv.className = 'seat';
    seatDiv.style.left = left + 'px';
    seatDiv.style.top = top + 'px';

    // Дилер чип
    if (dealerSeat === seatId) {
      const dealerChip = document.createElement('div');
      dealerChip.className = 'dealer-chip';
      dealerChip.textContent = 'D';
      seatDiv.appendChild(dealerChip);
    }

    const player = seatMap[seatId];
    if (player) {
      if (String(player.user_id) === String(userId)) seatDiv.classList.add('my-seat');
      if (String(state.current_player) === String(player.user_id)) seatDiv.classList.add('active');

      // Карты игрока
      const cardsEl = document.createElement('div');
      cardsEl.className = 'cards';
      const playerCards = (state.hole_cards?.[player.user_id] || []);
      playerCards.forEach(c => {
        const cd = document.createElement('div');
        cd.className = 'card';
        // Показываем карты только если это наш пользователь или showdown
        if (
          String(player.user_id) === String(userId) ||
          (state.phase === "result" && state.revealed_hands?.[player.user_id])
        ) {
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
      stackEl.textContent = state.stacks?.[player.user_id] ?? 0;
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

// Сажаем игрока на место (реализуй reloadGameState сам)
function joinSeat(seatId) {
  fetch(`/api/join-seat?table_id=${tableId}&user_id=${userId}&seat=${seatId}`, { method: 'POST' })
    .then(() => reloadGameState());
}

// Авто-отрисовка при ресайзе и запуске
window.addEventListener('resize', () => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
});
window.addEventListener('DOMContentLoaded', () => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
});
