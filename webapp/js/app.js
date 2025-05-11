// webapp/js/app.js
console.log('🔰 app.js загружен');
import { api }       from './api.js';
import { loadLobby } from './ui_lobby.js';
import { initGameUI }from './ui_game.js';

document.addEventListener('DOMContentLoaded', async()=>{
  console.log('🔰 DOMContentLoaded');
  const p = new URLSearchParams(location.search);
  const userId   = Number(p.get('user_id'));
  const username = p.get('username')||'—';
  const tableId  = p.get('table_id');

  document.getElementById('username')?.textContent = username;
  api('/api/balance',{ user_id:userId })
    .then(d=>document.getElementById('current-balance').textContent=d.balance+' USDT')
    .catch(()=>{});

  if (tableId) {
    initGameUI({tableId,userId,username});
  } else {
    const infoEl      = document.getElementById('info');
    const levelSelect = document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab=>{
      tab.onclick=()=> {
        document.querySelectorAll('.tab')
          .forEach(t=>t.classList.toggle('active',t===tab));
        loadLobby(levelSelect, infoEl, username, userId);
      };
    });
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
