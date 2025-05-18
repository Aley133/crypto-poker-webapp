import { getGameState } from './api.js';
import { createWebSocket } from './ws.js';

const params = new URLSearchParams(window.location.search);
const tableId = params.get('table_id');
const userId  = params.get('user_id');
const username = params.get('username') || userId;

const statusEl     = document.getElementById('status');
const potEl        = document.getElementById('pot');
const currentBetEl = document.getElementById('current-bet');
const actionsEl    = document.getElementById('actions');
const leaveBtn     = document.getElementById('leave-btn');
const pokerTableEl = document.getElementById('poker-table');

// Отрисовка статуса, пота, кнопок
function updateUI(state) {
  if (!state.started) {
    statusEl.textContent = `Ожидаем игроков… (${state.players_count||0}/2)`;
    actionsEl.style.display = 'none';
  } else {
    statusEl.textContent = 'Игра началась';
    actionsEl.style.display = 'flex';
  }

  potEl.textContent        = `Пот: ${state.pot||0}`;
  currentBetEl.textContent = `Текущая ставка: ${state.current_bet||0}`;

  // Кнопки
  actionsEl.innerHTML = '';
  ['fold','check','call','bet','raise'].forEach(act => {
    const btn = document.createElement('button');
    btn.textContent = act;
    btn.onclick = () => {
      let amount = 0;
      if (act==='bet'||act==='raise') {
        amount = parseInt(prompt('Сумма:'))||0;
      }
      ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
    };
    actionsEl.appendChild(btn);
  });
}

// Перевод полярных в экранные
function polarToCartesian(cx, cy, r, deg) {
  const rad = (deg-90)*Math.PI/180;
  return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
}

// Отрисовка «среды» стола
function renderTable(state) {
  pokerTableEl.innerHTML = '';
  const players = state.players||[];
  const cx = pokerTableEl.clientWidth/2;
  const cy = pokerTableEl.clientHeight/2;
  const r  = cx - 60;

  players.forEach((p,i) => {
    const angle = 360*i/players.length + 180;
    const pos   = polarToCartesian(cx, cy, r, angle);
    const seat  = document.createElement('div');
    seat.className = 'player-seat';
    seat.style.left = `${pos.x}px`;
    seat.style.top  = `${pos.y}px`;

    const name = document.createElement('div');
    name.textContent = p.username;
    seat.appendChild(name);

    const cardsWrapper = document.createElement('div');
    (state.hole_cards?.[p.user_id]||[]).forEach(card=>{
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = card;
      cardsWrapper.appendChild(c);
    });
    seat.appendChild(cardsWrapper);

    pokerTableEl.appendChild(seat);
  });
}

let ws;
(async ()=>{
  const init = await getGameState(tableId);
  updateUI(init);
  renderTable(init);

  ws = createWebSocket(tableId, userId, username, e=>{
    const st = JSON.parse(e.data);
    updateUI(st);
    renderTable(st);
  });
})();

leaveBtn.onclick = async ()=>{
  await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
  location.href = 'index.html';
};
