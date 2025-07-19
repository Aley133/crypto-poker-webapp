// webapp/js/app.js
import * as api from './api.js';
import { loadLobby } from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', () => {
  const tg = window.Telegram?.WebApp;
  window.initData = tg?.initData || '';
  if (tg) tg.ready();

  // 1) Получаем userId из Telegram-WebApp
  let userId;
  if (tg?.initDataUnsafe?.user?.id) {
    userId = tg.initDataUnsafe.user.id;
  } else {
    const p = new URLSearchParams(location.search);
    userId = p.get('user_id') || 'guest_' + Date.now();
    console.warn('Тестовый userId:', userId);
  }

  // 2) Отобразить в шапке
  const nameEl = document.getElementById('username');
  if (nameEl) nameEl.textContent = userId;
  api.getBalance(0, userId)
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
    const infoEl = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab')
          .forEach(t => t.classList.toggle('active', t === tab));
        loadLobby(levelSelect, infoEl, userId);
      };
    });
    // Авто-клик на первую вкладку
    document.querySelector('.tab[data-tab="cash"]')?.click();
  }
});
