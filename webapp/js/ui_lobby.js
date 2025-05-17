// ui_lobby.js

import { joinTable } from './api.js';

export async function loadLobby(tables) {
  const container = document.getElementById('tables');
  container.innerHTML = '';
  tables.forEach(tableId => {
    const btn = document.createElement('button');
    btn.textContent = `Join table ${tableId}`;
    btn.onclick = async () => {
      const userId = crypto.randomUUID();
      const username = window.Telegram?.WebApp?.initDataUnsafe?.user?.username
        || prompt('Enter your name');
      // сохраняем, чтобы на /game.html без username не прилетела ошибка
      localStorage.setItem('user_id', userId);
      localStorage.setItem('username', username);

      await joinTable(tableId, userId, username);
      window.location.href = `game.html?table_id=${tableId}&user_id=${userId}&username=${username}`;
    };
    container.appendChild(btn);
  });
}
