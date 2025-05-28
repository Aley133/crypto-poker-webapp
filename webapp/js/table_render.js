// table_render.js

// Центрирование и расчет стола
function getTableDims() {
  const wrapper = document.getElementById('poker-table-wrapper');
  const W = wrapper.offsetWidth;
  const H = wrapper.offsetHeight;
  // Соотношение: ширина всегда <= 90% wrapper, высота через пропорцию (овальный стол)
  let w = Math.min(W * 0.9, 960);  // макс ширина 960px
  let h = w * 0.60;                // овальность (подбирай, если нужно)
  const cx = W / 2, cy = H / 2;
  return { w, h, cx, cy, rx: w * 0.44, ry: h * 0.41 }; // rx/ry - "орбиты" для игроков
}

// Генерация углов для мест
function getSeatAngles(N) {
  if (N === 2) return [90, 270];
  if (N === 3) return [90, 210, 330];
  if (N === 4) return [90, 180, 270, 0];
  if (N === 5) return [90, 162, 234, 306, 18];
  if (N === 6) return [90, 150, 210, 270, 330, 30];
  // По кругу для любого N
  let out = [];
  for (let i = 0; i < N; ++i) out.push(90 + (360 / N) * i);
  return out;
}

// Основной рендер функции
export function renderTable(state, userId) {
  const pokerTableEl = document.getElementById('poker-table');
  const borderEl     = document.getElementById('poker-table-border');
  const wrapperEl    = document.getElementById('poker-table-wrapper');
  const seatsEl      = document.getElementById('seats');
  const actionsEl    = document.getElementById('actions');
  const communityEl  = document.getElementById('community-cards');

  // Очистка
  seatsEl.innerHTML = '';
  communityEl.innerHTML = '';

  // 1. Общие карты
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

  // 2. Габариты и абсолютное центрирование
  const { w, h, cx, cy, rx, ry } = getTableDims();
  [pokerTableEl, borderEl, seatsEl].forEach(el => {
    if (!el) return;
    el.style.position  = 'absolute';
    el.style.width     = w + 'px';
    el.style.height    = h + 'px';
    el.style.left      = '50%';
    el.style.top       = '50%';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.margin    = '0';
    el.style.padding   = '0';
  });
  // border чуть больше стола
  if (borderEl) {
    borderEl.style.width  = (w * 1.07) + 'px';
    borderEl.style.height = (h * 1.11) + 'px';
  }

  // 3. Сидения (игроки)
  const players = state.players || [];
  const holeMap = state.hole_cards || {};
  const userIndex = players.findIndex(p => String(p.user_id) === String(userId));
  const N = players.length;
  const angles = getSeatAngles(N);
  const seatOrder = [];
  for (let i = 0; i < N; ++i)
    seatOrder.push(angles[(i - userIndex + N) % N]);

  players.forEach((p, i) => {
    const seat = document.createElement('div');
    seat.className = 'seat';
    // Позиция от центра wrapper!
    const rad = seatOrder[i] * Math.PI / 180;
    seat.style.position  = 'absolute';
    seat.style.left      = (cx + rx * Math.cos(rad)) + 'px';
    seat.style.top       = (cy + ry * Math.sin(rad)) + 'px';
    seat.style.transform = 'translate(-50%, -50%)';

    if (String(p.user_id) === String(userId)) seat.classList.add('my-seat');
    if (String(state.current_player) === String(p.user_id)) seat.classList.add('active');

    // Карты игрока
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
        cd.innerHTML = `<span class="suit">🂠</span>`;
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
    seatsEl.appendChild(seat);
  });

  // 4. Фишка дилера
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
      dealerChipEl.style.position = 'absolute';
      dealerChipEl.style.left  = (cx + rx * Math.cos(rad) + 34) + 'px';
      dealerChipEl.style.top   = (cy + ry * Math.sin(rad) - 36) + 'px';
      dealerChipEl.style.display = 'flex';
    }
  });

  // 5. Кнопки действий — всегда под своим местом
  if (actionsEl && players.length > 0) {
    const rad = seatOrder[0] * Math.PI / 180;
    actionsEl.style.position = 'absolute';
    actionsEl.style.zIndex = 999;
    actionsEl.style.display = 'flex';
    const rad = seatOrder[0] * Math.PI / 180;
    actionsEl.style.left = (cx + rx * Math.cos(rad)) + 'px';
    actionsEl.style.top  = (cy + ry * Math.sin(rad) + 54) + 'px';
    actionsEl.style.transform = 'translate(-50%, 0)';
  }
}

// Для hotfix: пересчитывай layout и render при resize/mutation
window.addEventListener('resize', () => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
});

// Хак: исправляет баг первого запуска с багнутым центром (телеграм/вебвью)
// Форсируем пересчет layout по таймеру, если не центровано
setTimeout(() => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
}, 200);


