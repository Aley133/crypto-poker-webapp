// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

// DOM-элементы
const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');

// Функция-генератор простого UUID (для demo-пользователя)
function generateId() {
  // пример: 'user_' + 8 знаков hex
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Берём user_id из URL или localStorage, либо создаём новый
function getUserId() {
  const params = new URLSearchParams(window.location.search);
  const urlUid = params.get('user_id');
  if (urlUid) {
    localStorage.setItem('user_id', urlUid);
    return urlUid;
  }

  let uid = localStorage.getItem('user_id');
  if (!uid) {
    uid = generateId();
    localStorage.setItem('user_id', uid);
    console.log('Generated new user_id:', uid);
  }
  return uid;
}

// Основная функция подгрузки и отрисовки столов
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
        const uid = getUserId();
        await joinTable(t.id, uid);
        window.location.href = `game.html?table_id=${t.id}&user_id=${encodeURIComponent(uid)}`;
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    infoContainer.textContent = 'Ошибка загрузки столов';
  }
}

// Перезагрузка при смене уровня
levelSelect.addEventListener('change', loadTables);

// Запуск
loadTables();
