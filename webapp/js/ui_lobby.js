import { listTables } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');
const balanceSpan   = document.getElementById('current-balance');

// Генератор «авто-ID», если нет user_id
function generateId() {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Получаем или создаём userId и username
function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid   = params.get('user_id')   || localStorage.getItem('user_id');
  let uname = params.get('username')  || localStorage.getItem('username');

  if (params.get('user_id')) {
    localStorage.setItem('user_id', uid);
  }
  if (params.get('username')) {
    localStorage.setItem('username', uname);
  }

  if (!uid) {
    uid = generateId();
    localStorage.setItem('user_id', uid);
  }
  if (!uname) {
    uname = uid;
    localStorage.setItem('username', uname);
  }

  usernameEl.textContent = uname;
  return { userId: uid, username: uname };
}

const { userId, username } = getUserInfo();

// Показываем баланс, если элемент есть на странице
if (balanceSpan) {
  fetch(`/api/balance?user_id=${encodeURIComponent(userId)}`)
    .then(res => res.json())
    .then(data => {
      balanceSpan.innerText = `${data.balance} USDT`;
    })
    .catch(() => {
      balanceSpan.innerText = 'Ошибка';
    });
}

// Загрузка и рендер списка столов
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
        <p>Бай-ин: ${t.buy_in} USD | Игроки: ${t.players}</p>
        <button class="join-btn">Играть</button>
      `;
      card.querySelector('.join-btn').addEventListener('click', () => {
        // Открываем страницу игры — дальше всё в game.html
        const uidParam   = encodeURIComponent(userId);
        const unameParam = encodeURIComponent(username);
        window.open(
          `/game.html?table_id=${t.id}&user_id=${uidParam}&username=${unameParam}`,
          '_blank'
        );
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading tables:', err);
    infoContainer.textContent = 'Ошибка загрузки столов!';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
