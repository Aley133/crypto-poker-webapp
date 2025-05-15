// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

// Основные DOM-элементы
const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');

// Получаем или запрашиваем user_id
function getUserId() {
  let uid = localStorage.getItem('user_id');
  if (!uid) {
    uid = prompt('Введите ваш ID (лучше Telegram user_id)');
    localStorage.setItem('user_id', uid);
  }
  return uid;
}

// Рендерим список столов
async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
    const { tables } = await listTables(levelSelect.value);
    infoContainer.innerHTML = '';  // очищаем перед отрисовкой
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
        // Переходим на страницу игры, передавая и table_id, и user_id
        window.location.href = `game.html?table_id=${t.id}&user_id=${encodeURIComponent(uid)}`;
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    infoContainer.textContent = 'Ошибка загрузки столов';
  }
}

// Перезагружаем при смене уровня
levelSelect.addEventListener('change', loadTables);

// Инициалная загрузка
loadTables();
