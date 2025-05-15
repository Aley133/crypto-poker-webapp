// webapp/js/ui\_lobby.js
import { listTables, joinTable } from './api.js';

// DOM-элементы
const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

/\*\*

* Извлекает статичный Telegram user ID и username из Web App API.
* Бросает ошибку, если данные недоступны.
* @returns {{ uid: string, uname: string }}
  \*/
  function getTelegramUser() {
  if (!window\.Telegram || !Telegram.WebApp || !Telegram.WebApp.initDataUnsafe) {
  throw new Error('Telegram WebApp API is not available');
  }
  Telegram.WebApp.init();
  const user = Telegram.WebApp.initDataUnsafe.user;
  if (!user || !user.id) {
  throw new Error('Telegram user data is missing');
  }
  const uid = String(user.id);
  const uname = user.username || \[user.first\_name, user.last\_name].filter(Boolean).join(' ');
  return { uid, uname };
  }

// Получаем Telegram-пользователя
let userId, username;
try {
({ uid: userId, uname: username } = getTelegramUser());
usernameEl.textContent = username;
} catch (e) {
console.error(e);
usernameEl.textContent = 'Гость';
userId = 'guest\_' + Math.random().toString(36).substr(2, 8);
username = 'Гость';
}

/\*\*

* Загружает список столов и отображает карточки в лобби
  \*/
  async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
  const { tables } = await listTables(levelSelect.value);
  infoContainer.innerHTML = '';

  tables.forEach(({ id, small\_blind, big\_blind, buy\_in, players }) => {
  const card = document.createElement('div');
  card.className = 'table-card';
  card.innerHTML = `      <h3>Стол ${id}</h3>      <p>SB/BB: ${small_blind}/${big_blind}</p>      <p>Бай-ин: ${buy_in} | Игроки: ${players}</p>      <button class="join-btn">Играть</button>
     `;
  const btn = card.querySelector('.join-btn');
  btn.addEventListener('click', async () => {
  try {
  await joinTable(id, userId);
  const url = `/game.html?table_id=${id}` +
  `&user_id=${encodeURIComponent(userId)}` +
  `&username=${encodeURIComponent(username)}`;
  window\.location.href = url;
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

// Обработчик изменения уровня турниров
levelSelect.addEventListener('change', loadTables);
// Начальная загрузка
loadTables();
