// webapp/js/app.js
import { api }        from './api.js';
import { loadLobby }  from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1) Получаем userId из Telegram WebApp (или fallback из URL/localStorage)
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

  // 2) Спрячем нативный back в WebApp
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.expand();
    document.getElementById('back')?.remove();
  }

  // 3) Показать имя/баланс
  document.getElementById('username')!.textContent = userId;
  api('/api/balance', { user_id: userId })
    .then(d => document.getElementById('current-balance')!.textContent = d.balance + ' USDT')
    .catch(()=>{});

  // 4) Решаем: лобби или игра
  const p       = new URLSearchParams(location.search);
  const tableId = p.get('table_id');
  if (tableId) {
    initGameUI({ tableId, userId });
  } else {
    const infoEl      = document.getElementById('info')!;
    const levelSelect = document.getElementById('level-select') as HTMLSelectElement;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
        loadLobby(levelSelect, infoEl, userId);
      });
    });
    document.querySelector('.tab[data-tab="cash"]')?.click();
  }
});
