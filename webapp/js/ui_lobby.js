// webapp/js/ui_lobby.js
import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const { tables } = await api('/api/tables', { level: levelSelect.value });
    infoEl.innerHTML = '';
    if (tables.length === 0) {
      infoEl.textContent = 'Нет доступных столов.';
      return;
    }
    for (const t of tables) {
      // Создаём карточку стола
      const d = document.createElement('div');
      d.className = 'table';
      d.innerHTML = `
        <strong>Стол ${t.id}</strong><br>
        SB/BB: ${t.small_blind}/${t.big_blind}<br>
        Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
        <button data-id="${t.id}">Играть</button>
      `;
      // Жёсткая привязка атрибута data-id
      const btn = d.querySelector('button');
      btn.onclick = () => {
        const tid = btn.dataset.id;
        // Переходим в WebApp или просто в браузере
        const url = `${location.origin}/game.html?table_id=${tid}`;
        if (window.Telegram?.WebApp) {
          Telegram.WebApp.openLink(url);
        } else {
          location.href = url;
        }
      };
      infoEl.appendChild(d);
    }
  } catch (err) {
    console.error(err);
    infoEl.textContent = 'Ошибка при загрузке столов.';
  }
}
