// js/app.js
import { api }       from './api.js';
import { loadLobby } from './ui_lobby.js';
import { initGameUI }from './ui_game.js';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const userId   = Number(params.get('user_id'));
  const username = params.get('username') || '—';
  const tableId  = params.get('table_id');

  // Обновить шапку
  document.getElementById('username')?.textContent = username;
  api('/api/balance', { user_id: userId })
    .then(d => document.getElementById('current-balance').textContent = d.balance + ' USDT')
    .catch(()=>{});

  if (tableId) {
    // Играем
    initGameUI({ tableId, userId, username });
  } else {
    // Лобби
    const infoEl      = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    // Вкладки
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab')
          .forEach(t=>t.classList.toggle('active', t===tab));
        loadLobby(levelSelect, infoEl, username, userId);
      };
    });
    // Выбрать таб «cash» по умолчанию
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
