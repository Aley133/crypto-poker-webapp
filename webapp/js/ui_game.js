// webapp/js/ui_game.js
import { api } from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({ tableId, userId }) {
  const area = document.getElementById('table-area');
  area.innerHTML = `<p>Ждём второго игрока…</p>`;

  (async()=>{
    // join
    await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, { method:'POST', credentials:'same-origin' }).catch(()=>{});

    // WS
    const socket = new GameSocket(tableId, userId, payload => {
      if (payload.waiting) {
        area.innerHTML = `<p>${payload.message}</p>`;
        return;
      }
      // отрисовать каркас и стейт
      area.innerHTML = `
        <button id="back">← Назад</button>
        <h2>Стол ${tableId}</h2>
        <div id="community">Комьюнити: —</div>
        <div id="your">Ваши карты: —</div>
        <div id="pot">Банк: 0</div>
        <div id="players-area">Игроки: —</div>
        <div id="actions">
          <button data-act="check">Check</button>
          <button data-act="fold">Fold</button>
          <input type="number" id="bet-amount" placeholder="Сумма" min="1" />
          <button data-act="bet">Bet</button>
        </div>
      `;
      document.getElementById('back').onclick = ()=> window.history.back();

      render(payload);
      document.getElementById('actions').onclick = e => {
        const act = e.target.dataset.act;
        if (!act) return;
        const amt = act==='bet' ? Number(document.getElementById('bet-amount').value) : 0;
        if (act==='bet' && amt<1) return alert('Введите ставку');
        socket.send(act, amt);
      };
    });

    // initial state
    const st = await api('/api/game_state',{ table_id:tableId }).catch(()=>null);
    if (st) socket.ws.onmessage({ data:JSON.stringify(st) });
  })();

  function render(st) {
    document.getElementById('community').textContent = 'Комьюнити: ' + (st.community.join(' ')||'—');
    document.getElementById('your').innerHTML = 'Ваши карты: ' + (st.hole_cards[userId]||[]).map(c=>`<span class="card">${c}</span>`).join(' ');
    document.getElementById('pot').textContent = 'Банк: '+st.pot;
    const pa = document.getElementById('players-area'); pa.innerHTML = '';
    Object.entries(st.stacks).forEach(([uid,stk])=>{
      const div = document.createElement('div');
      div.textContent = `#${uid}: ${stk}` + (uid===st.current_player?' ← ход':'');
      pa.append(div);
    });
    const inp = document.getElementById('bet-amount'); inp.max = st.stacks[userId]||0;
  }
}
