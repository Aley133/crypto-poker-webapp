
import { listTables, joinTable } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

// Генератор «авто-ID» на случай, если не залогинились через Telegram
function generateId() {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Получаем user_id (и username) либо из Telegram-виджета, либо из localStorage, либо генерим
function getUserInfo() {
  // 1) если из URL приходит user_id (например, после первой авторизации) – подхватываем
  const params = new URLSearchParams(window.location.search);
  const urlUid = params.get('user_id');
  const urlName = params.get('username');
  if (urlUid) {
    localStorage.setItem('user_id', urlUid);
  }
  if (urlName) {
    localStorage.setItem('username', urlName);
    usernameEl.textContent = urlName;
  }

  // 2) иначе – берём из localStorage
  let uid = localStorage.getItem('user_id');
  let uname = localStorage.getItem('username');
  if (!uid) {
    uid = generateId();
    localStorage.setItem('user_id', uid);
  }
  if (uname) {
    usernameEl.textContent = uname;
  }
  return { uid, uname };
}

const { uid: userId } = getUserInfo();

async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
    const { tables } = await listTables(levelSelect.value);
    infoContainer.innerHTML = '';
    tables.forEach(t => {
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
        window.location.href =
          `game.html?table_id=${t.id}&user_id=${encodeURIComponent(userId)}` +
          `&username=${encodeURIComponent(localStorage.getItem('username')||'')}`;
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    infoContainer.textContent = 'Ошибка загрузки столов';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
