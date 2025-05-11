import { api } from './api.js';

export async function loadLobby(levelSelect, infoEl, username, userId) {
  infoEl.textContent = 'Загрузка столов…';
  try {
    const resp = await api('/api/tables', { level: levelSelect.value, user_id: userId });
    const tabs = resp.tables||[];
    infoEl.innerHTML = '';
    if (!tabs.length) { infoEl.textContent='Столов нет'; return; }
    tabs.forEach(t => {
      const d = document.createElement('div');
      d.className='table';
      d.innerHTML = `
        <strong>Стол ${t.id}</strong><br>
        SB/BB: ${t.small_blind}/${t.big_blind}<br>
        Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
        <button>Играть</button>
      `;
      d.querySelector('button').onclick = async () => {
        await api('/api/join', { table_id:t.id, user_id }); 
        window.location.href = `${location.origin}/game.html?user_id=${userId}&username=${encodeURIComponent(username)}&table_id=${t.id}`;
      };
      infoEl.append(d);
    });
  } catch(e) {
    infoEl.textContent='Ошибка лобби';
    console.error(e);
  }
}
