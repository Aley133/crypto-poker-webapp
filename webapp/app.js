// webapp/app.js
document.addEventListener('DOMContentLoaded', () => {
  const params   = new URLSearchParams(window.location.search);
  const userId   = params.get('user_id');
  const username = decodeURIComponent(params.get('username') || '—');
  const tableId  = params.get('table_id');

  const originWs = () => {
    // ws://... или wss://...
    return (location.protocol === 'https:' ? 'wss' : 'ws')
      + '://' + location.host;
  };

  // Общая вставка шапки
  const avatarEl  = document.getElementById('avatar');
  const nameEl    = document.getElementById('username');
  const balEl     = document.getElementById('current-balance');
  if (nameEl) nameEl.textContent = username;
  // аватарка — можно заменить на реальный URL
  if (avatarEl) avatarEl.style.backgroundImage = '';

  // Универсальная обёртка для GET-запросов к API
  async function api(path, extra = {}) {
    const q = new URLSearchParams({ user_id: userId, ...extra });
    const res = await fetch(path + '?' + q.toString());
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  // Обновим баланс на шапке
  api('/api/balance')
    .then(d => balEl.textContent = d.balance.toFixed(2) + ' USDT')
    .catch(() => { /* silent */ });

  // Кнопки депозит/вывод/история (общие)
  const infoEl = document.getElementById('info');
  const depBtn = document.getElementById('deposit');
  const wdrBtn = document.getElementById('withdraw');
  const histBtn= document.getElementById('history');

  if (depBtn) depBtn.onclick = async () => {
    try {
      const d = await api('/api/deposit');
      infoEl.textContent = `📥 Адрес для пополнения: ${d.address}`;
    } catch {
      infoEl.textContent = 'Ошибка при депозите';
    }
  };
  if (wdrBtn) wdrBtn.onclick = async () => {
    try {
      const d = await api('/api/withdraw');
      infoEl.textContent = `📤 ${d.instructions}`;
    } catch {
      infoEl.textContent = 'Ошибка при выводе';
    }
  };
  if (histBtn) histBtn.onclick = async () => {
    try {
      const d = await api('/api/history');
      infoEl.textContent = d.history.length
        ? d.history.join('\n')
        : '📜 История пуста';
    } catch {
      infoEl.textContent = 'Ошибка при получении истории';
    }
  };

  // Обработчик табов (лобби)
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab')
        .forEach(t => t.classList.toggle('active', t === tab));
      const name = tab.dataset.tab;
      if (name === 'cash') loadLobby();
      else if (name === 'tournaments') loadTournaments();
      else infoEl.textContent = 'Скоро…';
    });
  });

  // Уровень кеш-столов
  const levelSelect = document.getElementById('level-select');
  if (levelSelect) {
    levelSelect.onchange = () => {
      if (document.querySelector('.tab.active').dataset.tab === 'cash') {
        loadLobby();
      }
    };
  }

  // --------------------- Лобби ---------------------
  async function loadLobby() {
    infoEl.textContent = 'Загрузка столов…';
    try {
      const lvl = levelSelect ? levelSelect.value : 'Low';
      const tabs = await api('/api/tables', { level: lvl });
      infoEl.innerHTML = '';
      tabs.forEach(t => {
        const d = document.createElement('div');
        d.className = 'table';
        d.innerHTML = `
          <strong>Стол ${t.id}</strong><br>
          SB/BB: ${t.small_blind}/${t.big_blind}<br>
          Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
          <button data-id="${t.id}">Играть</button>
        `;
        infoEl.appendChild(d);
        d.querySelector('button').onclick = () => joinAndOpen(t.id);
      });
    } catch (e) {
      console.error(e);
      infoEl.textContent = 'Ошибка при загрузке столов';
    }
  }

  function joinAndOpen(tid) {
    api('/api/join', { table_id: tid })
      .then(res => {
        if (!res.success) {
          infoEl.textContent = res.message;
          return;
        }
        // переход в игру
        const url = `${location.origin}/game.html`
          + `?user_id=${userId}`
          + `&username=${encodeURIComponent(username)}`
          + `&table_id=${tid}`;
        if (window.Telegram && Telegram.WebApp) {
          Telegram.WebApp.openLink(url);
        } else {
          location.href = url;
        }
      })
      .catch(() => infoEl.textContent = 'Не удалось присоединиться');
  }

  // ------------------ Турниры ---------------------
  async function loadTournaments() {
    infoEl.textContent = 'Загрузка турниров…';
    try {
      const list = await api('/api/tournaments');
      infoEl.innerHTML = '';
      list.forEach(tr => {
        const d = document.createElement('div');
        d.className = 'table';
        d.innerHTML = `
          <strong>${tr.name}</strong><br>
          Бай-ин: ${tr.buy_in} | Игроки: ${tr.players}/${tr.max_players}<br>
          Статус: ${tr.status}<br>
          <button data-id="${tr.id}">Присоединиться</button>
        `;
        infoEl.appendChild(d);
        d.querySelector('button').onclick = async () => {
          try {
            await api('/api/join_tournament', { tournament_id: tr.id });
            infoEl.textContent = '✅ Вы в турнире!';
          } catch (err) {
            infoEl.textContent = err.message || 'Ошибка';
          }
        };
      });
    } catch (e) {
      console.error(e);
      infoEl.textContent = 'Ошибка при загрузке турниров';
    }
  }

  // ----------------- Инициализация Лобби -----------------
  if (!tableId) {
    // если не в игре — показываем лобби
    // активируем первую вкладку
    document.querySelector('.tab[data-tab="cash"]').click();
  }

  // ------------------ Game.html -------------------
  if (tableId) {
    // подменяем табы и кнопки, чтобы в игре не путаться
    document.querySelector('.tabs').style.display = 'none';
    document.querySelector('.actions').style.display = 'none';

    // создаём WebSocket
    const ws = new WebSocket(`${originWs()}/ws/game/${tableId}`);

    ws.onopen = () => {
      // сразу запросим своё начальное состояние
      api('/api/game_state', { table_id: tableId })
        .then(renderState)
        .catch(()=>{/*silent*/});
    };
    ws.onmessage = evt => {
      const state = JSON.parse(evt.data);
      renderState(state);
    };

    // Создаём базовую разметку игрового стола
    infoEl.innerHTML = `
      <button id="back">← Назад</button>
      <div id="community-cards">Комьюнити: —</div>
      <div id="your-cards">Ваши карты: —</div>
      <div id="pot">Банк: 0</div>
      <div id="players-area">Игроки: —</div>
      <div id="actions">
        <button data-action="check">Check</button>
        <button data-action="fold">Fold</button>
        <input type="number" id="bet-amount" placeholder="Сумма" min="0"/>
        <button data-action="bet">Bet</button>
      </div>
    `;
    // Назад в лобби
    document.getElementById('back').onclick = () => {
      if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close();
      else location.href = location.origin + '/?user_id=' + userId + '&username=' + encodeURIComponent(username);
    };

    // Обработчик кликов по действиям
    infoEl.querySelectorAll('#actions button').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.action;
        const amt = act === 'bet'
          ? Number(document.getElementById('bet-amount').value) || 0
          : 0;
        ws.send(JSON.stringify({ user_id: Number(userId), action: act, amount: amt }));
      };
    });

    // Рендер состояния
    function renderState(state) {
      document.getElementById('community-cards').textContent =
        'Комьюнити: ' + (state.community.join(' ') || '—');
      const hole = state.hole_cards[userId] || [];
      document.getElementById('your-cards').textContent =
        'Ваши карты: ' + (hole.join(' ') || '—');
      document.getElementById('pot').textContent = 'Банк: ' + state.pot;
      // игроки и стеки
      const pa = Object.entries(state.stacks)
        .map(([uid,stk]) =>
          `#${uid}: ${stk}` + (Number(uid) === state.current_player ? ' ← ход' : '')
        ).join('\n');
      document.getElementById('players-area').textContent = 'Игроки:\n' + pa;
    }
  }
});
function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

const tableId = getParam('table_id');
const userId  = parseInt(getParam('user_id'), 10);
if (!tableId || !userId) {
  alert('Не задан table_id или user_id в URL, например ?table_id=1&user_id=123');
  throw new Error('Missing table_id/user_id');
}

// --- Селекторы DOM ---
const communityEl   = document.getElementById('community');
const playersEl     = document.getElementById('players');
const holeCardsEl   = document.getElementById('your-cards');
const potEl         = document.getElementById('pot');
const btnCheck      = document.getElementById('btn-check');
const btnFold       = document.getElementById('btn-fold');
const inputAmount   = document.getElementById('bet-amount');
const btnBet        = document.getElementById('btn-bet');

// --- Функция join + WS init ---
async function joinAndConnect() {
  // 1) присоединиться к столу
  const resp = await fetch(`/api/join?table_id=${tableId}&user_id=${userId}`, {
    method: 'POST'
  });
  if (!resp.ok) {
    const err = await resp.json();
    console.error('Join error:', err.detail || err);
    alert('Не удалось присоединиться к столу: ' + (err.detail||JSON.stringify(err)));
    return;
  }

  // 2) открыть WS
  initWebSocket();
}

// --- WebSocket ---
let ws;
function initWebSocket() {
  ws = new WebSocket(`${location.protocol.replace('http','ws')}//${location.host}/ws/game/${tableId}`);

  ws.onopen = () => {
    console.log('WS connected');
  };

  ws.onmessage = ev => {
    const state = JSON.parse(ev.data);
    console.log('WS state:', state);
    renderState(state);
  };

  ws.onclose = () => {
    console.warn('WS closed, попробуем переподключиться через 3 сек');
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = err => {
    console.error('WS error', err);
    ws.close();
  };
}

// --- Рендеринг стейта ---
function renderState(state) {
  // Community
  communityEl.innerHTML = state.community.length
    ? state.community.map(c => `<span class="card">${c}</span>`).join(' ')
    : '—';

  // Players (список user_id и их стеков; можно добавить имена)
  playersEl.innerHTML = Object.entries(state.stacks)
    .map(([uid, stack]) => {
      const cls = (parseInt(uid) === state.current_player)
        ? 'player current'
        : 'player';
      return `<div class="${cls}">Игрок ${uid}: ${stack}</div>`;
    }).join('');

  // Ваши карты
  const hole = state.hole_cards[userId] || [];
  holeCardsEl.innerHTML = hole.length
    ? hole.map(c => `<span class="card">${c}</span>`).join(' ')
    : '—';

  // Pot
  potEl.textContent = state.pot;

  // Блокировка кнопки Bet, если amount > ваш стек
  const myStack = state.stacks[userId] || 0;
  inputAmount.max = myStack;
  if (parseInt(inputAmount.value,10) > myStack) {
    inputAmount.value = myStack;
  }
}

// --- Отправка действий ---
function sendAction(action, amount=0) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ user_id: userId, action, amount }));
}

// --- Привязка кнопок ---
btnCheck.addEventListener('click', () => sendAction('check'));
btnFold .addEventListener('click', () => sendAction('fold'));
btnBet  .addEventListener('click', () => {
  const amt = parseInt(inputAmount.value, 10);
  if (isNaN(amt) || amt <= 0) {
    alert('Введите корректную сумму для ставки');
    return;
  }
  sendAction('bet', amt);
});

// --- Стартуем всё после загрузки ---
window.addEventListener('DOMContentLoaded', () => {
  joinAndConnect();
});
