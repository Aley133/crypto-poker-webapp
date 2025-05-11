// webapp/js/ui_lobby.js
import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, username, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const lvl  = levelSelect?.value || '';
    const resp = await api('/api/tables', { level: lvl });
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

    infoEl.querySelectorAll('.btn-join').forEach(btn => {
      btn.onclick = async () => {
        const tid = btn.dataset.id;
        try {
          const res = await fetch(`/api/join?table_id=${tid}&user_id=${userId}`, {
            method: 'POST', credentials: 'same-origin'
          });
          if (!res.ok) throw await res.json();
          window.location.href = `${location.origin}/game.html?table_id=${tid}`;
        } catch (err) {
          console.error('Join failed:', err);
          infoEl.textContent = 'Ошибка при входе: ' + (err.detail||err.message);
        }
      };
    });
  } catch (e) {
    console.error('loadLobby error:', e);
    infoEl.textContent = 'Ошибка при загрузке лобби.';
  }
}
