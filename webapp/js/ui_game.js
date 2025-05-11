// webapp/js/ui_game.js
import { api }        from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({ tableId, userId }) {
  const area = document.getElementById('table-area');
  area.innerHTML = `
    <button id="back">← Назад</button>
    <h2>Стол ${tableId}</h2>
    <div id="community">Ждем второго игрока…</div>
  `;
  document.getElementById('back').onclick = () => Telegram.WebApp.close();

  (async () => {
    // 1) join
    await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
      method: 'POST', credentials: 'same-origin'
    });

    // 2) WS
    const socket = new GameSocket(tableId, userId, payload => {
      if (payload.waiting) {
        area.querySelector('#community').textContent = payload.message;
        return;
      }
      // рисуем стол полностью
      area.innerHTML = `
        <button id="back">← Назад</button>
        <h2>Стол ${tableId}</h2>
        <div id="community">—</div>
        <div id="your">—</div>
        <div id="pot">0</div>
        <div id="players-area"></div>
        <div id="actions">
          <button data-act="check">Check</button>
          <button data-act="fold">Fold</button>
          <input id="bet-amount" type="number" min="1" placeholder="Сумма"/>
          <button data-act="bet">Bet</button>
        </div>
      `;
      document.getElementById('back').onclick = () => Telegram.WebApp.close();

      // рендер стейта
      render(payload);

      // биндим кнопки
      document.getElementById('actions').onclick = e => {
        const act = e.target.dataset.act;
        if (!act) return;
        const msg = { user_id: userId, action: act };
        if (act === 'bet') msg.amount = Number(document.getElementById('bet-amount').value);
        socket.send(msg.action, msg.amount);
      };

      function render(st) {
        document.getElementById('community').textContent = 'Комьюнити: ' + (st.community.join(' ')||'—');
        document.getElementById('your').innerHTML = 'Ваши карты: ' + (st.hole_cards[userId]||[]).map(c=>`<span class="card">${c}</span>`).join(' ');
        document.getElementById('pot').textContent = 'Банк: '+st.pot;
        const pa = document.getElementById('players-area');
        pa.innerHTML = '';
        Object.entries(st.stacks).forEach(([uid,stk])=>{
          const div = document.createElement('div');
          div.textContent = `#${uid}: ${stk}` + (uid===st.current_player?' ← ход':'');
          pa.append(div);
        });
        const inp = document.getElementById('bet-amount');
        inp.max = st.stacks[userId] || 0;
      }
    });

    // 3) initial state
    try {
      const st = await api('/api/game_state',{ table_id:tableId });
      socket.onmessage({ data: JSON.stringify(st) });
    } catch {}
  })();
}
