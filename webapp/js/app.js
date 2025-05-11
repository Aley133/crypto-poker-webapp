// webapp/js/app.js
import { api }        from './api.js';
import { loadLobby }  from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Получаем userId
  let userId;
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    userId = window.Telegram.WebApp.initDataUnsafe.user.id;
  } else {
    const p = new URLSearchParams(location.search);
    userId = p.get('user_id')
      || localStorage.getItem('cp_user_id')
      || (() => {
        const id = 'u' + (Date.now() + Math.floor(Math.random()*1e3));
        localStorage.setItem('cp_user_id', id);
        return id;
      })();
  }

  // 2) Спрячем кнопку назад, если WebApp
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.expand();
    const backBtn = document.getElementById('back');
    if (backBtn) backBtn.style.display = 'none';
  }

  // 3) Показать имя/баланс
  const nameEl = document.getElementById('username');
  if (nameEl) nameEl.textContent = String(userId);
  api('/api/balance', { user_id: userId })
    .then(d => {
      const balEl = document.getElementById('current-balance');
      if (balEl) balEl.textContent = d.balance + ' USDT';
    })
    .catch(()=>{});

  // 4) Решаем: лобби или игра
  const p = new URLSearchParams(location.search);
  const tableId = p.get('table_id');

  if (tableId) {
    initGameUI({ tableId, userId });
  } else {
    const infoEl      = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    if (infoEl && levelSelect) {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.tab')
            .forEach(t => t.classList.toggle('active', t === tab));
          loadLobby(levelSelect, infoEl, userId);
        });
      });
      const cashTab = document.querySelector('.tab[data-tab="cash"]');
      if (cashTab) cashTab.click();
    }
  }
});
