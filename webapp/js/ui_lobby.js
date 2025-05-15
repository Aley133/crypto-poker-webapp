// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

/**
 * Получаем информацию о пользователе:
 * 1) Если запущено как Telegram WebApp и доступен Telegram.WebApp.initDataUnsafe.user
 * 2) Иначе — из URL-параметров
 */
function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get('user_id');
  let uname = params.get('username');

  // 1) Если приходит из URL, сохраняем в sessionStorage
  if (uid) {
    sessionStorage.setItem('user_id', uid);
  } else {
    // 2) Если нет в URL, пробуем из sessionStorage
    uid = sessionStorage.getItem('user_id');
  }
  if (uname) {
    sessionStorage.setItem('username', uname);
  } else {
    uname = sessionStorage.getItem('username');
  }

  // 3) Если все еще нет, пробуем из Telegram WebApp
  if (!uid && window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      uid = String(user.id);
      uname = user.username || [user.first_name, user.last_name].filter(Boolean).join(' ');
      sessionStorage.setItem('user_id', uid);
      sessionStorage.setItem('username', uname);
    }
  }

  // 4) В крайнем случае генерим новый
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
    }
  }

  // 2) Fallback: из URL-параметров
  const params = new URLSearchParams(window.location.search);
  uid = params.get('user_id');
  uname = params.get('username') || uid;
  usernameEl.textContent = uname;
  return { uid, uname };
}

// Инициализация
const { uid: userId, uname: username } = getUserInfo();

/**
 * Загружает и рендерит список столов
 */
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
