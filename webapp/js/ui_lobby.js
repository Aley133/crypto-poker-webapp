import { listTables } from './api.js';

const infoContainer = document.getElementById('info');
const levelSelect   = document.getElementById('level-select');
const usernameEl    = document.getElementById('username');
const balanceSpan   = document.getElementById('current-balance'); // Для баланса

// Генератор «авто-ID» на случай, если не залогинились через Telegram
function generateId() {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Получаем user_id и username из URL, localStorage или генерим новые
function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get('user_id') || localStorage.getItem('user_id');
  let uname = params.get('username') || localStorage.getItem('username');

  // Сохраняем в localStorage, если пришло из URL
  if (params.get('user_id')) {
    localStorage.setItem('user_id', uid);
  }
  if (params.get('username')) {
    localStorage.setItem('username', uname);
  }

  // Генерируем ID, если нет
  if (!uid) {
    uid = generateId();
    localStorage.setItem('user_id', uid);
  }
  // Дефолт для username — это uid
  if (!uname) {
    uname = uid;
    localStorage.setItem('username', uname);
  }

  // Отображаем в UI
  usernameEl.textContent = uname;

  return { uid, uname };
}

const { uid: userId, uname: username } = getUserInfo();

// ======= Баланс =======
if (balanceSpan) {
  fetch(`/api/balance?user_id=${userId}`)
    .then(res => res.json())
    .then(data => {
      balanceSpan.innerText = `${data.balance} USDT`;
    })
    .catch(() => {
      balanceSpan.innerText = 'Ошибка';
    });
}

// Загрузка списка столов
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
        <p>Buy-in: ${t.min_buy_in} - ${t.max_buy_in}</p>
        <p>Игроки: ${t.players}</p>
        <button class="join-btn">Играть</button>
      `;
      card.querySelector('.join-btn').addEventListener('click', async () => {
        const uidParam = encodeURIComponent(userId);
        const unameParam = encodeURIComponent(username);
        window.open(
          `/game.html?table_id=${t.id}&user_id=${uidParam}&username=${unameParam}`,
          '_blank'
        );
      });
      infoContainer.appendChild(card);
    });
  } catch (err) {
    infoContainer.textContent = 'Ошибка загрузки столов!';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
