// webapp/js/ui_lobby.js
import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, username, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const lvl  = levelSelect?.value || '';
    const resp = await api('/api/tables', { level: lvl, user_id: userId });
    const tables = resp.tables || [];
    infoEl.innerHTML = '';
    if (tables.length === 0) {
      infoEl.textContent = 'Нет доступных столов.';
      return;
    }
    tables.forEach(t => {
      const card = document.createElement('div');
      card.className = 'table';
      card.innerHTML = `
        <strong>Стол ${t.id}</strong><br>
        SB/BB: ${t.small_blind}/${t.big_blind}<br>
        Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
        <button class="btn-join" data-id="${t.id}">Играть</button>
      `;
      infoEl.appendChild(card);
    });

    // Назначаем обработчики после рендера
    infoEl.querySelectorAll('.btn-join').forEach(btn => {
      btn.onclick = async () => {
        const tid = btn.dataset.id;
        try {
          // POST /api/join
          const res = await fetch(`/api/join?table_id=${tid}&user_id=${userId}`, {
            method: 'POST',
            credentials: 'same-origin'
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || JSON.stringify(err));
          }
          // После успешного join — переходим на игру
          const url = `${location.origin}/game.html` +
                      `?user_id=${userId}` +
                      `&username=${encodeURIComponent(username)}` +
                      `&table_id=${tid}`;
          console.log('Navigate to:', url);
          window.location.href = url;
        } catch (err) {
          console.error('Join failed:', err);
          infoEl.textContent = 'Не удалось присоединиться: ' + err.message;
        }
      };
    });

  } catch (e) {
    console.error('loadLobby error:', e);
    infoEl.textContent = 'Ошибка при загрузке лобби: ' + (e.detail || e.message);
  }
}
