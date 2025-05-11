// js/ui_game.js
import { api } from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI(params) {
  const { tableId, userId, username } = params;
  const infoEl = document.getElementById('table-area');
  // Скрыть лобби-элементы
  document.querySelector('.tabs')?.remove();
  document.querySelector('.deposit-withdraw')?.remove();

  // Построить базисный html (либо в HTML-шаблоне оставить готовым)
  infoEl.innerHTML = `
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

  // Воркер WS
  const socket = new GameSocket(tableId, renderState);
  socket.userId = userId;

  // Сразу получить состояние руками (если WS ещё не прислал)
  api('/api/game_state', { table_id: tableId, user_id: userId })
    .then(renderState)
    .catch(()=>{});

  // Привязать кнопки
  document.getElementById('actions').onclick = e => {
    const act = e.target.dataset.action;
    if (!act) return;
    if (act === 'bet') {
      const amt = Number(document.getElementById('bet-amount').value) || 0;
      if (amt < 1) return alert('Введите сумму ставки');
      socket.send('bet', amt);
    } else {
      socket.send(act);
    }
  };

  function renderState(state) {
    document.getElementById('community-cards').textContent =
      'Комьюнити: ' + (state.community.join(' ') || '—');
    document.getElementById('your-cards').textContent =
      'Ваши карты: ' + ((state.hole_cards[userId]||[]).join(' ') || '—');
    document.getElementById('pot').textContent = 'Банк: ' + state.pot;
    document.getElementById('players-area').textContent =
      'Игроки:\n' + Object.entries(state.stacks)
        .map(([uid,stk]) =>
          `#${uid}: ${stk}` + (Number(uid)===state.current_player ? ' ← ход' : '')
        ).join('\n');
    // Обновить input max
    const myStack = state.stacks[userId]||0;
    const inp = document.getElementById('bet-amount');
    inp.max = myStack;
    inp.placeholder = `до ${myStack}`;
  }
}
