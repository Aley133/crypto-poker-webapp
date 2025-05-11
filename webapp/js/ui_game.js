// webapp/js/ui_game.js
import { api }        from './api.js';
import { GameSocket } from './ws.js';

/**
 * Инициализирует интерфейс игрового стола.
 * @param {{ tableId: string, userId: string }} params
 */
export function initGameUI({ tableId, userId }) {
  const area = document.getElementById('table-area');

  // Функция, рисующая основной UI стола
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

  // Функция рендера полноценного состояния
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
      div.textContent = `#${uid}: ${stack}`;
      if (uid === String(st.current_player)) div.classList.add('current');
      pa.appendChild(div);
    });

    const inp = document.getElementById('bet-amount');
    inp.max = st.stacks[userId] || 0;
    inp.placeholder = `до ${inp.max}`;
  }

  // Общий обработчик любого сообщения (ожидание или полноценный state)
  function handlePayload(payload) {
    if (payload.waiting) {
      // Рисуем сообщение ожидания
      area.innerHTML = `
        <button id="back">← Назад</button>
        <p style="color:#fff; font-size:1.2em;">${payload.message}</p>
      `;
      document.getElementById('back').onclick = () => history.back();
    } else {
      // Если ещё не отрисован каркас — делаем это
      if (!document.getElementById('actions')) {
        renderTableSkeleton();
      }
      renderState(payload);
    }
  }

  // Подписываем обработку кликов на действия, после отрисовки скелета
  function bindActionHandlers(socket) {
    document.getElementById('actions').onclick = e => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'bet') {
        const amt = Number(document.getElementById('bet-amount').value) || 0;
        if (amt < 1) return alert('Введите сумму ставки');
        socket.send('bet', amt);
      } else {
        socket.send(act);
      }
    };
  }

  // Запуск
  (async () => {
    // 1) Зарегистрироваться на столе
    try {
      await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {
      // Игнорируем, если уже присоединились
    }

    // 2) Показать каркас (если сразу не приходит waiting)
    renderTableSkeleton();

    // 3) Открыть WS
    const socket = new GameSocket(tableId, userId, handlePayload);

    // 4) Получить стартовый стейт по REST
    try {
      const st = await api('/api/game_state', { table_id: tableId });
      handlePayload(st);
    } catch {
      // silent
    }

    // 5) Привязать клики по кнопкам (после каркаса)
    bindActionHandlers(socket);
  })();
}
