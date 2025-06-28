import { listTables, joinTable } from './api.js';

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

  if (params.get('user_id')) localStorage.setItem('user_id', uid);
  if (params.get('username')) localStorage.setItem('username', uname);

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
    .then(data => balanceSpan.innerText = `${data.balance} USDT`)
    .catch(() => balanceSpan.innerText = 'Ошибка');
}

// Модалка выбора места и депозита (можно интегрировать кастомный UI вместо prompt)
function showLobbyDepositModal({ table, onConfirm, onCancel }) {
  const maxSeats = table.max_players || table.players || 5;
  const seatInput = prompt(
    `Стол ${table.id}: выберите место (0–${maxSeats - 1}):`, '0'
  );
  const seat = parseInt(seatInput, 10);
  if (isNaN(seat) || seat < 0 || seat >= maxSeats) {
    onCancel();
    return;
  }

  const depositInput = prompt(
    `Введите депозит (мин. ${table.buy_in}):`, table.buy_in
  );
  const deposit = parseFloat(depositInput);
  if (isNaN(deposit) || deposit < table.buy_in) {
    alert('Неверная сумма');
    onCancel();
    return;
  }

  onConfirm({ seat, deposit });
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

      const btn = card.querySelector('.join-btn');
      btn.addEventListener('click', () => {
        // Открываем пустую вкладку сразу, чтобы избежать блокировок
        const newTab = window.open('about:blank', '_blank');

        showLobbyDepositModal({
          table: t,
          onConfirm: async ({ seat, deposit }) => {
            console.log('>> joinTable params:', { tableId: t.id, userId, seat, deposit });
            try {
              await joinTable(t.id, userId, seat, deposit);
              newTab.location.href =
                `game.html?table_id=${t.id}&user_id=${encodeURIComponent(userId)}&username=${encodeURIComponent(username)}`;
            } catch (err) {
              newTab.close();
              alert('Не удалось зайти: ' + err.message);
            }
          },
          onCancel: () => newTab.close()
        });
      });

      infoContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Ошибка загрузки столов:', err);
    infoContainer.textContent = 'Ошибка загрузки!';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
