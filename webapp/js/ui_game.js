// webapp/js/ui_game.js
import { api }        from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({tableId, userId}) {
  const area = document.getElementById('table-area');
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
      <input type="number" id="bet-amount" placeholder="Сумма" min="1"/>
      <button data-act="bet">Bet</button>
    </div>
  `;
  document.getElementById('back').onclick = () => history.back();

  // Подключаем WS и API join
  (async () => {
    try {
      await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
        method: 'POST', credentials: 'same-origin'
      });
    } catch {}
    const socket = new GameSocket(tableId, userId, renderState);
    // начальный стейт
    api('/api/game_state', { table_id:tableId }).then(renderState).catch(() => {});
    document.getElementById('actions').onclick = e => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'bet') {
        const amt = Number(document.getElementById('bet-amount').value) || 0;
        if (amt<1) return alert('Введите ставку');
        socket.send('bet', amt);
      } else {
        socket.send(act);
      }
    };
  })();

  function renderState(st) {
    document.getElementById('community').textContent =
      'Комьюнити: ' + (st.community.join(' ')||'—');
    document.getElementById('your').innerHTML =
      'Ваши карты: ' + ((st.hole_cards[userId]||[]).map(c=>`<span class="card">${c}</span>`).join(' '));
    document.getElementById('pot').textContent = 'Банк: ' + st.pot;
    document.getElementById('players-area').textContent =
      'Игроки:\n' + Object.entries(st.stacks).map(([u,s])=>
        `#${u}: ${s}` + (Number(u)===st.current_player?' ← ход':'')
      ).join('\n');
    const inp = document.getElementById('bet-amount');
    inp.max = st.stacks[userId]||0;
    inp.placeholder = `до ${inp.max}`;
  }
}
