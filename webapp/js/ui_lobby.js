// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

/**
 * Получает статичный идентификатор и имя пользователя из Telegram WebApp.
 * Если WebApp API недоступен, берёт из URL (?user_id&username).
 * Если и там нет — генерирует гостевой ID.
 * @returns {{ uid: string, uname: string }}
 */
function getUserInfo() {
  // 1) Telegram WebApp
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
    Telegram.WebApp.init();
    const user = Telegram.WebApp.initDataUnsafe.user;
    if (user && user.id) {
      const uid = String(user.id);
      const uname = user.username ||
        [user.first_name, user.last_name].filter(Boolean).join(' ');
      return { uid, uname };
    }
  }

  // 2) URL-параметры
  const params = new URLSearchParams(window.location.search);
  let uid   = params.get('user_id');
  let uname = params.get('username');

  // 3) Гостевой кейс
  if (!uid) {
    uid = 'guest_' + Math.random().toString(36).substr(2, 8);
  }
  if (!uname) {
    uname = uid;
  }

  return { uid, uname };
}

// Инициализация пользователя
const { uid: userId, uname: username } = getUserInfo();
usernameEl.textContent = username;

/**
 * Загружает список столов и отображает их в лобби.
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
        try {
          await joinTable(t.id, userId);
          const url = `/game.html?table_id=${t.id}` +
                      `&user_id=${encodeURIComponent(userId)}` +
                      `&username=${encodeURIComponent(username)}`;
          window.location.href = url;
        } catch (err) {
          console.error('Не удалось присоединиться к столу:', err);
          alert('Не удалось присоединиться к столу');
        }
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Ошибка загрузки столов:', err);
    infoContainer.textContent = 'Ошибка загрузки столов';
  }
}

// Реакция на выбор уровня и первоначальная загрузка
levelSelect.addEventListener('change', loadTables);
loadTables();
