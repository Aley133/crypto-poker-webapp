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
        <button data-id="${t.id}">Играть</button>
      `;
      const btn = card.querySelector('button');
      btn.onclick = async () => {
        try {
          // POST /api/join
          const q = new URLSearchParams({ table_id: t.id, user_id });
          const res = await fetch(`/api/join?${q.toString()}`, {
            method: 'POST',
            credentials: 'same-origin'
          });
          if (!res.ok) throw await res.json();

          // После успешного join — идём в игру
          const url = `${location.origin}/game.html` +
                      `?user_id=${userId}` +
                      `&username=${encodeURIComponent(username)}` +
                      `&table_id=${t.id}`;
          console.log('Navigate to:', url);
          window.location.assign(url);
        } catch (err) {
          console.error('Join error:', err);
          infoEl.textContent = err.detail || JSON.stringify(err);
        }
      };
      infoEl.appendChild(card);
    });
  } catch (e) {
    console.error('loadLobby error:', e);
    infoEl.textContent = 'Ошибка при загрузке
