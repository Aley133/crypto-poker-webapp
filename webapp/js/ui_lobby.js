// webapp/js/ui_lobby.js
import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const { tables } = await api('/api/tables', { level: levelSelect.value });
    infoEl.innerHTML = '';
    if (!tables.length) {
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
        window.Telegram.WebApp.openLink(
          `${location.origin}/game.html?table_id=${t.id}`
        );
      };
      infoEl.appendChild(d);
    });
  } catch (e) {
    console.error(e);
    infoEl.textContent = 'Ошибка при загрузке столов.';
  }
}
