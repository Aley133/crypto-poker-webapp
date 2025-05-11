import { api } from './api.js';
import { loadLobby } from './ui_lobby.js';
import { initGameUI } from './ui_game.js';

document.addEventListener('DOMContentLoaded', ()=>{
  const p=new URLSearchParams(location.search);
  const userId=Number(p.get('user_id')), username=p.get('username')||'—', tableId=p.get('table_id');
  document.getElementById('username').textContent=username;
  api('/api/balance',{table_id:tableId,user_id:userId})
    .then(d=>document.getElementById('current-balance').textContent=d.balance+' USDT')
    .catch(()=>{});
  if (tableId) initGameUI({tableId,userId});
  else{
    const infoEl=document.getElementById('info'), lvl=document.getElementById('level-select');
    document.querySelectorAll('.tab').forEach(tab=>{
      tab.onclick=()=>{
        document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===tab));
        loadLobby(lvl,infoEl,username,userId);
      };
    });
    document.querySelector('.tab[data-tab="cash"]').click();
  }
});
