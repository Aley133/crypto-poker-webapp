/ webapp/js/ui_game.js
import { api }      from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({tableId, userId, username}) {
  const area = document.getElementById('table-area');
  area.innerHTML = `
    <button id="back">← Назад</button>
    <div id="community-cards">Комьюнити: —</div>
    <div id="your-cards">Ваши карты: —</div>
    <div id="pot">Банк: 0</div>
    <div id="players-area">Игроки: —</div>
    <div id="actions">
      <button data-action="check">Check</button>
      <button data-action="fold">Fold</button>
      <input type="number" id="bet-amount" placeholder="Сумма" min="1"/>
      <button data-action="bet">Bet</button>
    </div>
  `;
  document.getElementById('back').onclick = () => history.back();

  const socket = new GameSocket(tableId, userId, renderState);
  api('/api/game_state', { table_id:tableId, user_id:userId })
    .then(renderState).catch(()=>{});

  document.getElementById('actions').onclick = e => {
    const act = e.target.dataset.action;
    if (!act) return;
    if (act === 'bet') {
      const amt = Number(document.getElementById('bet-amount').value)||0;
      if (amt<1) return alert('Введите сумму ставки');
      socket.send('bet', amt);
    } else socket.send(act);
  };

  function renderState(state) {
    document.getElementById('community-cards').textContent =
      'Комьюнити: ' + (state.community.join(' ')||'—');
    document.getElementById('your-cards').textContent =
      'Ваши карты: ' + ((state.hole_cards[userId]||[]).join(' ')||'—');
    document.getElementById('pot').textContent = 'Банк: ' + state.pot;
    document.getElementById('players-area').textContent =
      'Игроки:\n' + Object.entries(state.stacks)
        .map(([uid,stk])=>
          `#${uid}: ${stk}` + (Number(uid)===state.current_player?' ← ход':'')
        ).join('\n');
    const inp = document.getElementById('bet-amount');
    inp.max = state.stacks[userId]||0;
    inp.placeholder = `до ${inp.max}`;
  }
}
