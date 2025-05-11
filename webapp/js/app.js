// webapp/js/app.js
import { api }        from './api.js';
import { loadLobby }  from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

// 1) Получаем реальный Telegram user.id
let userId;
if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
  userId = Telegram.WebApp.initDataUnsafe.user.id;
} else {
  // fallback для браузера
  const p = new URLSearchParams(location.search);
  userId = p.get('user_id') || 'guest';
}

// 2) Если в Telegram — убираем кнопку «назад»
if (window.Telegram && Telegram.WebApp) {
  Telegram.WebApp.expand();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('username').textContent = userId;
  api('/api/balance',{ user_id:userId })
    .then(d=>document.getElementById('current-balance').textContent=d.balance+' USDT')
    .catch(()=>{});

  const p = new URLSearchParams(location.search);
  const tableId = p.get('table_id');

  if (tableId) {
    initGameUI({ tableId, userId });
  } else {
    const infoEl = document.getElementById('info');
    const lvlSel = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.tab')
          .forEach(t=>t.classList.toggle('active', t===tab));
        loadLobby(lvlSel, infoEl, userId, userId);
      };
    });
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
