// webapp/js/ui_game.js
import { api }        from './api.js';
import { GameSocket } from './ws.js';

export function initGameUI({ tableId, userId }) {
  const area = document.getElementById('table-area');

  // 1) каркас стола (сюда мы ререндерим детали)
  function renderTableSkeleton() {
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
  }

  // 2) заполняем только данные
  function renderState(st) {
    document.getElementById('community').textContent =
      'Комьюнити: ' + (st.community.join(' ') || '—');

    const hole = st.hole_cards[userId] || [];
    document.getElementById('your').innerHTML =
      'Ваши карты: ' + hole.map(c => `<span class="card">${c}</span>`).join(' ');

    document.getElementById('pot').textContent = 'Банк: ' + st.pot;

    const pa = document.getElementById('players-area');
    pa.innerHTML = '';
    Object.entries(st.stacks).forEach(([uid, stack]) => {
      const div = document.createElement('div');
      div.textContent = `#${uid}: ${stack}` + (uid === st.current_player ? ' ← ход' : '');
      pa.appendChild(div);
    });

    const inp = document.getElementById('bet-amount');
    inp.max = st.stacks[userId] || 0;
    inp.placeholder = `до ${inp.max}`;
  }

  // 3) общий обработчик сообщения (waiting или полноценный стейт)
  function handlePayload(payload) {
    // если каркас ещё не отрисован — отрисуем
    if (!document.getElementById('actions')) {
      renderTableSkeleton();
      // повесим обработчик кнопок один раз
      document.getElementById('actions').onclick = e => {
        const act = e.target.dataset.act;
        if (!act) return;
        const amt = act === 'bet'
          ? Number(document.getElementById('bet-amount').value) || 0
          : 0;
        if (act === 'bet' && amt < 1) {
          return alert('Введите сумму ставки');
        }
        socket.send(act, amt);
      };
    }

    if (payload.waiting) {
      // показываем сообщение ожидания вместо community
      document.getElementById('community').textContent = payload.message;
    } else {
      // полноценный рендер
      renderState(payload);
    }
  }

  let socket;  // будет доступен внутри handlePayload
  (async () => {
    // a) join
    await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
      method: 'POST', credentials: 'same-origin'
    }).catch(() => {});

    // b) REST начальный стейт (если есть)
    try {
      const st = await api('/api/game_state', { table_id: tableId });
      // отрисуем каркас + стейт
      handlePayload(st);
    } catch {
      // ничего
    }

    // c) WS
    socket = new GameSocket(tableId, userId, handlePayload);
  })();
}
