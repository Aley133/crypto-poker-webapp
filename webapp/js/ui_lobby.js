// webapp/js/ui_lobby.js
import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, username, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const lvl = levelSelect?.value || '';
    const resp = await api('/api/tables', { level: lvl, user_id: userId });
    const tables = resp.tables || [];
    infoEl.innerHTML = '';
    if (tables.length === 0) {
      infoEl.textContent = 'Нет доступных столов.';
      return;
    }
    tables.forEach(t => {
      const d = document.createElement('div');
      d.className = 'table';
      d.innerHTML = `
        <strong>Стол ${t.id}</strong><br>
        SB/BB: ${t.small_blind}/${t.big_blind}<br>
        Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
        <button data-id="${t.id}">Играть</button>
      `;
      d.querySelector('button').onclick = () => {
        api('/api/join', { table_id: t.id, user_id: userId })
          .then(() => {
            window.location.href = `/game.html?user_id=${userId}` +
                                   `&username=${encodeURIComponent(username)}` +
                                   `&table_id=${t.id}`;
          })
          .catch(err => infoEl.textContent = err.detail || JSON.stringify(err));
      };
      infoEl.appendChild(d);
    });
  } catch (e) {
    console.error('loadLobby error:', e);
    infoEl.textContent = 'Ошибка при загрузке лобби: ' + (e.detail || e.message);
  }
}
