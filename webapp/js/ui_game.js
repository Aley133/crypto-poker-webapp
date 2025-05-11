// webapp/js/ui_game.js
import { api }        from './api.js';
import { GameSocket } from './ws.js';

/**
 * Инициализирует интерфейс игрового стола.
 * @param {{tableId: string, userId: string}} params
 */
export function initGameUI({ tableId, userId }) {
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
      <input type="number" id="bet-amount" placeholder="Сумма" min="1" />
      <button data-act="bet">Bet</button>
    </div>
  `;
  document.getElementById('back').onclick = () => history.back();

  (async () => {
    // 1. Регистрируемся за столом
    try {
      await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch {
      // Игнорируем ошибки (например, уже присоединились)
    }

    // 2. Инициализируем WebSocket
    const socket = new GameSocket(tableId, userId, renderState);

    // 3. Запрашиваем текущее состояние через REST, пока WS не пришлёт
    try {
      const state = await api('/api/game_state', { table_id: tableId });
      renderState(state);
    } catch {
      // silent
    }

    // 4. Обработка действий пользователя
    document.getElementById('actions').onclick = e => {
      const act = e.target.dataset.act;
      if (!act) return;
      const msg = { user_id: userId, action: act };
      if (act === 'bet') {
        const amt = Number(document.getElementById('bet-amount').value) || 0;
        if (amt < 1) return alert('Введите сумму ставки');
        msg.amount = amt;
      }
      socket.send(msg.action, msg.amount);
    };
  })();

  /**
   * Рендерит состояние стола на странице
   * @param {{community: string[], hole_cards: Record<string, string[]>, stacks: Record<string, number>, pot: number, current_player: number}} st
   */
  function renderState(st) {
    // Комьюнити
    document.getElementById('community').textContent =
      'Комьюнити: ' + (st.community.join(' ') || '—');

    // Ваши карты
    const hole = st.hole_cards[userId] || [];
    document.getElementById('your').innerHTML =
      'Ваши карты: ' + hole.map(c => `<span class="card">${c}</span>`).join(' ');

    // Банк
    document.getElementById('pot').textContent = 'Банк: ' + st.pot;

    // Игроки
    const pa = document.getElementById('players-area');
    pa.innerHTML = '';
    Object.entries(st.stacks).forEach(([uid, stack]) => {
      const div = document.createElement('div');
      div.textContent = `#${uid}: ${stack}`;
      if (uid === String(st.current_player)) div.classList.add('current');
      pa.appendChild(div);
    });

    // Настройка инпута ставки
    const inp = document.getElementById('bet-amount');
    inp.max = st.stacks[userId] || 0;
    inp.placeholder = `до ${inp.max}`;
  }
}
