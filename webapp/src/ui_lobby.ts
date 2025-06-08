import { listTables, joinTable, Table } from './api';

const infoContainer = document.getElementById('info') as HTMLElement;
const levelSelect   = document.getElementById('level-select') as HTMLSelectElement;
const usernameEl    = document.getElementById('username') as HTMLElement;
const balanceSpan   = document.getElementById('current-balance') as HTMLElement | null;

function generateId(): string {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get('user_id') || localStorage.getItem('user_id') || '';
  let uname = params.get('username') || localStorage.getItem('username') || '';

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
  return { uid, uname };
}

const { uid: userId, uname: username } = getUserInfo();

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

async function loadTables() {
  infoContainer.textContent = 'Загрузка…';
  try {
    const { tables } = await listTables(levelSelect.value);
    infoContainer.innerHTML = '';
    tables.forEach((t: Table) => {
      const card = document.createElement('div');
      card.className = 'table-card';
      card.innerHTML = `
        <h3>Стол ${t.id}</h3>
        <p>SB/BB: ${t.small_blind}/${t.big_blind}</p>
        <p>Бай-ин: ${t.buy_in} | Игроки: ${t.players}</p>
        <button class="join-btn">Играть</button>
      `;
      card.querySelector('.join-btn')!.addEventListener('click', async () => {
        await joinTable(t.id, userId);
        const uidParam = encodeURIComponent(userId);
        const unameParam = encodeURIComponent(username);
        window.open(
          `/game.html?table_id=${t.id}&user_id=${uidParam}&username=${unameParam}`,
          '_blank'
        );
      });
      infoContainer.appendChild(card);
    });
  } catch {
    infoContainer.textContent = 'Ошибка загрузки столов!';
  }
}

levelSelect.addEventListener('change', loadTables);
loadTables();
