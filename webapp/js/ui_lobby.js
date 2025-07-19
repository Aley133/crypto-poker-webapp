import { listTables } from './api.js';
import { getUserInfo, initTelegramData } from './user.js';

// DOM is not guaranteed to be ready when module is loaded
// so wrap initialization in DOMContentLoaded

document.addEventListener('DOMContentLoaded', () => {
  initTelegramData();

  const infoContainer = document.getElementById('info');
  const levelSelect   = document.getElementById('level-select');
  const usernameEl    = document.getElementById('username');
  const balanceSpan   = document.getElementById('current-balance');

  const { userId, username } = getUserInfo();
  if (usernameEl) usernameEl.textContent = username;

  // ======= Баланс =======
  if (balanceSpan) {
    const url = `/api/balance?user_id=${userId}`;
    fetch(url, { headers: { Authorization: window.initData } })
      .then(res => res.json())
      .then(data => {
        balanceSpan.innerText = `${data.balance} USDT`;
      })
      .catch(err => {
        console.error(err);
        balanceSpan.innerText = 'Ошибка';
      });
  }

  // Загрузка списка столов
  async function loadTables() {
    infoContainer.textContent = 'Загрузка…';
    try {
      const { tables } = await listTables(levelSelect.value);
      infoContainer.innerHTML = '';
      if (!tables || tables.length === 0) {
        infoContainer.textContent = 'Столов нет';
        return;
      }
      tables.forEach(t => {
        const card = document.createElement('div');
        card.className = 'table-card';
        card.innerHTML = `
          <h3>Стол ${t.id}</h3>
          <p>SB/BB: ${t.small_blind}/${t.big_blind}</p>
          <p>Бай-ин: ${t.buy_in} | Игроки: ${t.players}</p>
          <button class="join-btn">Играть</button>
        `;
        card.querySelector('.join-btn').addEventListener('click', () => {
          const uidParam = encodeURIComponent(userId);
          const unameParam = encodeURIComponent(username);
          window.open(
            `/game.html?table_id=${t.id}&user_id=${uidParam}&username=${unameParam}` +
            `&min=${t.min_deposit}&max=${t.max_deposit}`,
            '_blank'
          );
        });
        infoContainer.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      infoContainer.textContent = 'Ошибка загрузки столов!';
    }
  }

  levelSelect.addEventListener('change', loadTables);
  loadTables();
});
