// Этот модуль использует только fetch
import { initTelegramData, getUserInfo } from './user.js';

// Инициализируем initData сразу, чтобы все запросы содержали подпись
initTelegramData();

// Основной блок инициализации выполняем после полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  const infoContainer = document.getElementById('info');
  const levelSelect   = document.getElementById('level-select');
  const usernameEl    = document.getElementById('username');
  const balanceSpan   = document.getElementById('current-balance');

  const { userId, username } = getUserInfo();
  usernameEl.textContent = username;

  // ======= Баланс =======
  if (balanceSpan) {
    fetch(`/api/balance?user_id=${encodeURIComponent(userId)}`, {
      headers: { Authorization: window.initData },
    })
      .then(res => res.json())
      .then(data => {
        balanceSpan.innerText = `${data.balance} USDT`;
      })
      .catch(err => {
        console.error(err);
        balanceSpan.innerText = 'Ошибка';
      });
  }

  async function loadTables() {
    infoContainer.textContent = 'Загрузка…';
    try {
      const res = await fetch(
        `/api/tables?level=${encodeURIComponent(levelSelect.value)}`,
        { headers: { Authorization: window.initData } }
      );
      if (!res.ok) throw new Error('fetch tables');
      const { tables } = await res.json();
      infoContainer.innerHTML = '';
      if (!tables || !tables.length) {
        infoContainer.textContent = 'Нет доступных столов';
        return;
      }
      tables.forEach(t => {
        const card = document.createElement('div');
        card.className = 'table-card';
        card.innerHTML = `
          <h3>Стол ${t.id}</h3>
          <p>SB/BB: ${t.sb}/${t.bb}</p>
          <p>Депозит: [${t.min_deposit} – ${t.max_deposit}] | Игроки: ${t.players}</p>
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
      alert('Ошибка загрузки столов');
      infoContainer.textContent = 'Ошибка загрузки столов!';
    }
  }

  levelSelect.addEventListener('change', loadTables);
  loadTables();
});
