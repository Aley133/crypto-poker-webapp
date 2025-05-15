// webapp/js/ui_lobby.js
import { listTables, joinTable } from './api.js';

const tablesContainer = document.getElementById('tablesContainer');
const levelSelect = document.getElementById('levelSelect');

// Сохраняем user_id в localStorage, если ещё нет
function getUserId() {
  let uid = localStorage.getItem('user_id');
  if (!uid) {
    uid = prompt('Введите ваш ID (лучше Telegram user_id)');
    localStorage.setItem('user_id', uid);
  }
  return uid;
}

async function loadTables() {
  tablesContainer.innerHTML = 'Загрузка...';
  try {
    const { tables } = await listTables(levelSelect.value);
    tablesContainer.innerHTML = '';
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
        const uid = getUserId();
        await joinTable(t.id, uid);
        window.location.href = `game.html?table_id=${t.id}&user_id=${encodeURIComponent(uid)}`;
      });
      tablesContainer.appendChild(card);
    }
  } catch (e) {
    tablesContainer.innerHTML = 'Ошибка загрузки таблиц';
    console.error(e);
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
