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

// Для отладки выводим состояние в консоль
def function logState(state) {
    console.log('Game state:', state);
}

function updateUI(state) {
    logState(state);

    if (!state.started) {
        statusEl.textContent = `Ожидаем игроков… (${state.players_count || 0}/2)`;
        actionsEl.style.display = 'none';
    } else {
        statusEl.textContent = 'Игра началась';
        actionsEl.style.display = 'flex';
    }

    const hole = state.hole_cards?.[userId] || state.hands?.[userId] || [];
    const community = state.community_cards || state.community || [];

    potEl.textContent        = `Пот: ${state.pot || 0}`;
    currentBetEl.textContent = `Текущая ставка: ${state.current_bet || state.currentBet || 0}`;

    actionsEl.innerHTML = '';
    ['fold','check','call','bet','raise'].forEach(act => {
        const btn = document.createElement('button');
        btn.textContent = act;
        btn.onclick = () => {
            let amount = 0;
            if (act === 'bet' || act === 'raise') {
                amount = parseInt(prompt('Сумма:')) || 0;
            }
            ws.send(JSON.stringify({ user_id: userId, action: act, amount }));
        };
        actionsEl.appendChild(btn);
    });
}

function polarToCartesian(cx, cy, r, deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderTable(state) {
    pokerTableEl.innerHTML = '';
    const players = state.players || [];
    const cx = pokerTableEl.clientWidth / 2;
    const cy = pokerTableEl.clientHeight / 2;
    const radius = cx - 60;

    players.forEach((p, idx) => {
        const angle = 360 * idx / players.length + 180;
        const pos = polarToCartesian(cx, cy, radius, angle);

        const seat = document.createElement('div');
        seat.className = 'player-seat';
        seat.style.left = `${pos.x}px`;
        seat.style.top  = `${pos.y}px`;

        const nameEl = document.createElement('div');
        nameEl.textContent = p.username;
        seat.appendChild(nameEl);

        const hand = state.hole_cards?.[p.user_id] || state.hands?.[p.user_id] || [];
        const cardsEl = document.createElement('div');
        hand.forEach(card => {
            const c = document.createElement('div');
            c.className = 'card';
            c.textContent = card;
            cardsEl.appendChild(c);
        });
        seat.appendChild(cardsEl);

        pokerTableEl.appendChild(seat);
    });
}

let ws;
(async () => {
    try {
        const initState = await getGameState(tableId);
        updateUI(initState);
        renderTable(initState);
    } catch (err) {
        console.error('Init error', err);
        statusEl.textContent = 'Ошибка получения состояния';
    }

    ws = createWebSocket(tableId, userId, username, event => {
        const state = JSON.parse(event.data);
        updateUI(state);
        renderTable(state);
    });
})();

leaveBtn.onclick = async () => {
    await fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, { method: 'POST' });
    location.href = 'index.html';
};
