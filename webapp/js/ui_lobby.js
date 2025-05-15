// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

/**
 * Извлекает текущего пользователя:
 * 1) В Telegram WebApp — из Telegram.WebApp.initDataUnsafe.user
 * 2) Иначе — из URL-параметров ?user_id=&username=
 * Если и там нет — генерит новый ID и имя по нему.
 */
function getUserInfo() {
  // 1) Telegram WebApp
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    Telegram.WebApp.init();
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      const uid = String(user.id);
      const uname = user.username || [user.first_name, user.last_name].filter(Boolean).join(' ');
      usernameEl.textContent = uname;
      return { uid, uname };
    }
  }

  // 2) URL-параметры
  const params = new URLSearchParams(window.location.search);
  let uid   = params.get('user_id');
  let uname = params.get('username');

  // 3) Если всё ещё нет — генерируем «авто-ID»
  if (!uid) {
    uid = 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }
  if (!uname) {
    uname = uid;
  }

  usernameEl.textContent = uname;
  return { uid, uname };
}

// Инициализация пользователя
const { uid: userId, uname: username } = getUserInfo();

/**
 * Загрузка и отображение списка столов
 */
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
        const url = `/game.html?table_id=${t.id}` +
                    `&user_id=${encodeURIComponent(userId)}` +
                    `&username=${encodeURIComponent(username)}`;
        window.location.href = url;
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
