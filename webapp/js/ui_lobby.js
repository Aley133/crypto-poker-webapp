// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

// Генератор «авто-ID»
function generateId() {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Получаем/сохраняем userId и username в sessionStorage
function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get('user_id') || sessionStorage.getItem('user_id');
  let uname = params.get('username') || sessionStorage.getItem('username');

  if (params.has('user_id')) sessionStorage.setItem('user_id', uid);
  if (params.has('username')) sessionStorage.setItem('username', uname);

  if (!uid) {
    uid = generateId();
    sessionStorage.setItem('user_id', uid);
  }
  if (!uname) {
    uname = uid;
    sessionStorage.setItem('username', uname);
  }

  usernameEl.textContent = uname;
  return { uid, uname };
}

const { uid: userId, uname: username } = getUserInfo();

async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
    const { tables } = await listTables(levelSelect.value);
    infoContainer.innerHTML = '';
    for (const t of tables) {
      const card = document.createElement('div');
      card.className = 'table-card';
      card.innerHTML = `
        <h3>Стол ${t.id}</h3>
        <p>SB/BB: ${t.small_blind}/${t.big_blind}</p>
        <p>Бай-ин: ${t.buy_in} | Игроки: ${t.players}</p>
        <button class="join-btn">Играть</button>
      `;
      card.querySelector('.join-btn').addEventListener('click', async () => {
        await joinTable(t.id, userId);
        const url = `/game.html?table_id=${t.id}` +
                    `&user_id=${encodeURIComponent(userId)}` +
                    `&username=${encodeURIComponent(username)}`;
        window.location.href = url;
      });
      infoContainer.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    infoContainer.textContent = 'Ошибка загрузки столов';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
