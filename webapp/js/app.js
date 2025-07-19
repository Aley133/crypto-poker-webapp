// webapp/js/app.js
import * as api from './api.js';
import { initGameUI } from './ui_game.js';
import { getUserInfo, initTelegramData } from './user.js';

document.addEventListener('DOMContentLoaded', () => {
  initTelegramData();
  const { userId, username } = getUserInfo();

  // 2) Отобразить в шапке
  const nameEl = document.getElementById('username');
  if (nameEl) nameEl.textContent = username;
  api.getBalance(userId)
    .then(d => {
      const b = document.getElementById('current-balance');
      if (b) b.textContent = d.balance + ' USDT';
    })
    .catch(() => {});

  // 3) Смотрим, какой режим — лобби или игра
  const p = new URLSearchParams(location.search);
  const tableId = p.get('table_id');

  if (tableId) {
    // — Игра
    initGameUI({ tableId, userId });
  } else {
    // — Лобби
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab')
          .forEach(t => t.classList.toggle('active', t === tab));
        // ui_lobby.js self-initializes on DOMContentLoaded
      };
    });
    // Авто-клик на первую вкладку
    document.querySelector('.tab[data-tab="cash"]')?.click();
  }
});
