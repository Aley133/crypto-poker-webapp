// webapp/js/app.js
import { api }        from './api.js';
import { loadLobby }  from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Точный Telegram-ID
  let userId;
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    userId = Telegram.WebApp.initDataUnsafe.user.id;
  } else {
    // В обычном браузере дадим понятную ошибку
    alert('Запустите через Telegram WebApp, пожалуйста');
    return;
  }

  // 2) Спрячем встроенную кнопку назад (WebApp API)
  Telegram.WebApp.expand();
  const backBtn = document.getElementById('back');
  if (backBtn) backBtn.style.display = 'none';

  // 3) Показать баланс из бэка
  document.getElementById('username').textContent = userId;
  api('/api/balance', { table_id: '', user_id: userId })
    .then(d => document.getElementById('current-balance').textContent = d.balance + ' USDT')
    .catch(() => {});

  // 4) Решаем, лобби или стол
  const p = new URLSearchParams(location.search);
  const tableId = p.get('table_id');
  if (tableId) {
    initGameUI({ tableId, userId });
  } else {
    const infoEl      = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        loadLobby(levelSelect, infoEl, userId);
      };
    });
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
