// table_render.js

// Центрирование и расчет стола
function getTableDims() {
  const wrapper = document.getElementById('poker-table-wrapper');
  const W = wrapper.offsetWidth;
  const H = wrapper.offsetHeight;
  // Соотношение: ширина <= 90% wrapper, высота через пропорцию (овальный стол)
  let w = Math.min(W * 0.9, 960);
  let h = w * 0.60;
  const cx = W / 2, cy = H / 2;
  return { w, h, cx, cy, rx: w * 0.44, ry: h * 0.41 };
}

// Всегда 6 мест!
const N_SEATS = 6;

// angles для 6 мест (по кругу, "сидящий внизу — seat 0")
function getSeatAngles(N) {
  if (N === 6) return [90, 150, 210, 270, 330, 30];
  let out = [];
  for (let i = 0; i < N; ++i) out.push(90 + (360 / N) * i);
  return out;
}

// Рендер всех мест
export function renderTable(state, userId) {
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

  // Габариты и центр
  function getTableDims() {
    const wrapper = wrapperEl;
    const W = wrapper.offsetWidth;
    const H = wrapper.offsetHeight;
    let w = Math.min(W * 0.9, 960);
    let h = w * 0.60;
    const cx = W / 2, cy = H / 2;
    return { w, h, cx, cy, rx: w * 0.44, ry: h * 0.41 };
  }
  const { cx, cy, rx, ry } = getTableDims();

  // Массив игроков, где p.seat — seat id (0..5)
  const players = state.players || [];
  // Формируем map seatId => player
  const seatsMap = Array(N_SEATS).fill(null);
  players.forEach(p => { if (typeof p.seat !== "undefined") seatsMap[p.seat] = p; });

  const angles = getSeatAngles(N_SEATS);

  // Рисуем ВСЕ 6 мест
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

    const player = seatsMap[seatId];
    if (player) {
      // Место занято — рисуем игрока
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
      // Место пустое — рисуем SIT
      seatDiv.classList.add('empty');
      const sitBtn = document.createElement('button');
      sitBtn.className = 'sit-btn';
      sitBtn.textContent = 'SIT';
      sitBtn.onclick = () => joinSeat(seatId); // Реализуй joinSeat(seatId)
      seatDiv.appendChild(sitBtn);
    }

    seatsEl.appendChild(seatDiv);
  }
}

// Абсолютное позиционирование блока кнопок (НЕ добавляем actionsEl в DOM!)
export function positionActionsEl(state, userId) {
  const wrapper = document.getElementById('poker-table-wrapper');
  const actionsEl = document.getElementById('actions');
  const { cx, cy, rx, ry } = getTableDims();
  const players = state.players || [];
  const userIndex = players.findIndex(p => String(p.user_id) === String(userId));
  const N = players.length;
  if (N === 0) return;
  const angles = getSeatAngles(N);
  const seatOrder = [];
  for (let i = 0; i < N; ++i) seatOrder.push(angles[(i - userIndex + N) % N]);
  const rad = seatOrder[0] * Math.PI / 180;
  actionsEl.style.position = 'absolute';
  actionsEl.style.left     = (cx + rx * Math.cos(rad)) + 'px';
  actionsEl.style.top      = (cy + ry * Math.sin(rad) + 54) + 'px';
  actionsEl.style.transform = 'translate(-50%, 0)';
  actionsEl.style.zIndex   = 999;
  actionsEl.style.display  = 'flex';
}

// Для hotfix: пересчитывай layout и render при resize/mutation
window.addEventListener('resize', () => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
  if (window.currentTableState && window.currentUserId)
    positionActionsEl(window.currentTableState, window.currentUserId);
});

// Для первого запуска — форсируем пересчет через таймаут (баг Telegram)
setTimeout(() => {
  if (window.currentTableState)
    renderTable(window.currentTableState, window.currentUserId);
  if (window.currentTableState && window.currentUserId)
    positionActionsEl(window.currentTableState, window.currentUserId);
}, 200);
