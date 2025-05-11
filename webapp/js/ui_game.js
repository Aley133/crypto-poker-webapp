import { api } from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({tableId,userId}) {
  const a = document.getElementById('table-area');
  a.innerHTML=`
    <button id="back">← Назад</button>
    <div id="community-cards">Комьюнити: —</div>
    <div id="your-cards">Ваши карты: —</div>
    <div id="pot">Банк: 0</div>
    <div id="players-area">Игроки: —</div>
    <div id="actions">
      <button data-action="check">Check</button>
      <button data-action="fold">Fold</button>
      <input id="bet-amount" type="number" placeholder="Сумма" min="1"/>
      <button data-action="bet">Bet</button>
    </div>
  `;
  document.getElementById('back').onclick = ()=>history.back();

  const sock = new GameSocket(tableId,userId,render);
  api('/api/game_state',{table_id:tableId,user_id:userId}).then(render).catch(()=>{});

  document.getElementById('actions').onclick = e => {
    const act = e.target.dataset.action;
    if (!act) return;
    if (act==='bet') {
      const v=Number(document.getElementById('bet-amount').value)||0;
      if (!v) return alert('Сумма');
      sock.send('bet',v);
    } else sock.send(act);
  };

  function render(st) {
    document.getElementById('community-cards').textContent = 'Комьюнити: '+(st.community.join(' ')||'—');
    document.getElementById('your-cards').textContent = 'Ваши карты: '+((st.hole_cards[userId]||[]).join(' ')||'—');
    document.getElementById('pot').textContent = 'Банк: '+st.pot;
    document.getElementById('players-area').textContent = 'Игроки:\n'+
      Object.entries(st.stacks).map(([u,s])=>
        `#${u}: ${s}` + (Number(u)===st.current_player?' ← ход':'')
      ).join('\n');
    const inp=document.getElementById('bet-amount');
    inp.max = st.stacks[userId]||0;
    inp.placeholder=`до ${inp.max}`;
  }
}
