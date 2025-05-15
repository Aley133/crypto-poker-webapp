// webapp/js/ui\_lobby.js
import { listTables, joinTable } from './api.js';

// DOM-элементы
const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');

/\*\*

* Получает статичный Telegram user ID и username через WebApp API
* @returns {{uid: string, uname: string}}
* @throws {Error} если API недоступен или данных нет
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

// Инициализация пользователя
let userId, username;
try {
({ uid: userId, uname: username } = getTelegramUser());
usernameEl.textContent = username;
} catch (err) {
console.error(err);
userId = 'guest\_' + Math.random().toString(36).substr(2, 8);
username = 'Гость';
usernameEl.textContent = username;
}

/\*\*

* Загружает и отображает список столов в лобби
  \*/
  async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
  const { tables } = await listTables(levelSelect.value);
  infoContainer.innerHTML = '';
  tables.forEach(table => {
  const card = document.createElement('div');
  card.className = 'table-card';
  card.innerHTML = `      <h3>Стол ${table.id}</h3>      <p>SB/BB: ${table.small_blind}/${table.big_blind}</p>      <p>Бай-ин: ${table.buy_in} | Игроки: ${table.players}</p>      <button class="join-btn">Играть</button>
     `;
  const btn = card.querySelector('.join-btn');
  btn.addEventListener('click', async () => {
  try {
  await joinTable(table.id, userId);
  window\.location.href =
  `/game.html?table_id=${table.id}` +
  `&user_id=${encodeURIComponent(userId)}` +
  `&username=${encodeURIComponent(username)}`;
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

// Обработчик изменения уровня
levelSelect.addEventListener('change', loadTables);
// Первоначальная загрузка
loadTables();
