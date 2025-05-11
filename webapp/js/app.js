// webapp/js/app.js
import { api } from './api.js';
import { loadLobby } from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded',()=>{
  // Telegram user ID
  let userId;
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    userId = Telegram.WebApp.initDataUnsafe.user.id;
  } else {
    const p = new URLSearchParams(location.search);
    userId = p.get('user_id') || 'guest_'+Date.now();
    console.warn('Переходим с временным userId',userId);
  }

  // Баланс и имя
  document.getElementById('username').textContent = userId;
  api('/api/balance',{ table_id:'0', user_id:userId })
    .then(d=>document.getElementById('current-balance').textContent=d.balance+' USDT')
    .catch(()=>{});

  // Навигация
  const p = new URLSearchParams(location.search);
  const tableId = p.get('table_id');
  if (tableId) {
    initGameUI({ tableId, userId });
  } else {
    const infoEl = document.getElementById('info');
    const lvl = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab=>{
      tab.onclick=()=>{
        document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t===tab));
        loadLobby(lvl, infoEl, userId);
      };
    });
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
