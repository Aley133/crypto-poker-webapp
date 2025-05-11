// webapp/js/app.js
import { api }        from './api.js';
import { loadLobby }  from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', () => {
  const p = new URLSearchParams(location.search);
  const userId   = Number(p.get('user_id'));
  const username = p.get('username') || '—';
  const tableId  = p.get('table_id');

  // Показать имя и баланс
  const nameEl = document.getElementById('username');
  const balEl  = document.getElementById('current-balance');
  if (nameEl) nameEl.textContent = username;
  if (balEl) {
    api('/api/balance', { table_id: tableId, user_id: userId })
      .then(d => balEl.textContent = d.balance + ' USDT')
      .catch(()=>{/*silent*/});
  }

  if (tableId) {
    // Играем
    initGameUI({ tableId, userId });
  } else {
    // Лобби
    const infoEl      = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab')
          .forEach(t => t.classList.toggle('active', t === tab));
        loadLobby(levelSelect, infoEl, username, userId);
      };
    });
    // Стартуем с Cash вкладки
    const cashTab = document.querySelector('.tab[data-tab="cash"]');
    if (cashTab) cashTab.click();
  }
});
