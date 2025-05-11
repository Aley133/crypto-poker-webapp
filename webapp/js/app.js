// webapp/js/app.js
console.log('🔰 app.js монолит загружен');

document.addEventListener('DOMContentLoaded', () => {
  console.log('🔰 DOMContentLoaded');

  // === Параметры из URL ===
  const params   = new URLSearchParams(window.location.search);
  const userId   = Number(params.get('user_id'));
  const username = params.get('username') || '—';
  const tableId  = params.get('table_id');

  // === DOM-узлы ===
  const infoEl     = document.getElementById('info');
  const tableArea  = document.getElementById('table-area');
  const levelSelect= document.getElementById('level-select');
  const tabs       = document.querySelectorAll('.tab');
  const userSpan   = document.getElementById('username');
  const balSpan    = document.getElementById('current-balance');

  // Шапка
  if (userSpan) userSpan.textContent = username;
  if (balSpan)  balSpan.textContent = '0 USDT';

  // Утилита HTTP GET
  async function api(path, params = {}) {
    const q = new URLSearchParams({ user_id: userId, ...params });
    const res = await fetch(path + '?' + q);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  // === Лобби ===
  async function loadLobby() {
    infoEl.innerHTML = 'Загрузка столов…';
    try {
      const lvl = levelSelect ? levelSelect.value : '';
      // Получаем объект { tables: [...] }
      const resp = await api('/api/tables', { level: lvl });
      const tabsList = resp.tables || [];  // здесь массив столов
      infoEl.innerHTML = '';
      tabsList.forEach(t => {
        const d = document.createElement('div');
        d.className = 'table';
        d.innerHTML = `
          <strong>Стол ${t.id}</strong><br>
          SB/BB: ${t.small_blind}/${t.big_blind}<br>
          Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
          <button data-id="${t.id}">Играть</button>
        `;
        d.querySelector('button').onclick = () => joinTable(t.id);
        infoEl.appendChild(d);
      });

      if (tabsList.length === 0) {
        infoEl.textContent = 'Нет доступных столов.';
      }
    } catch (e) {
      console.error('loadLobby error:', e);
      infoEl.textContent = 'Ошибка при загрузке лобби: ' + (e.detail || e.message || JSON.stringify(e));
    }
  }

  async function joinTable(tid) {
    try {
      await api('/api/join', { table_id: tid });
      window.location.href = `game.html?user_id=${userId}&username=${encodeURIComponent(username)}&table_id=${tid}`;
    } catch (e) {
      infoEl.textContent = e.detail || JSON.stringify(e);
    }
  }

  // Обработчик табов
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      if (tab.dataset.tab === 'cash')  loadLobby();
      else /* tournaments */            infoEl.textContent = 'Турниры пока не готовы';
    };
  });

  // Если мы в лобби (нет tableId)
  if (!tableId) {
    tabs[0].click();
    return;
  }

  // === Игра ===
  // Чистим лобби-интерфейс
  document.querySelector('.tabs')?.remove();
  document.querySelector('#lobby-controls')?.remove();
  infoEl.remove();  // полностью убираем <main id="info">

  // Рисуем контейнер игрового стола
  tableArea.innerHTML = `
    <button id="back">← Назад</button>
    <div id="community-cards">Комьюнити: —</div>
    <div id="your-cards">Ваши карты: —</div>
    <div id="pot">Банк: 0</div>
    <div id="players-area">Игроки: —</div>
    <div id="actions">
      <button data-action="check">Check</button>
      <button data-action="fold">Fold</button>
      <input type="number" id="bet-amount" placeholder="Сумма" min="1"/>
      <button data-action="bet">Bet</button>
    </div>
  `;
  document.getElementById('back').onclick = () => window.history.back();

  // WebSocket-клиент
  let ws;
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/game/${tableId}`);

    ws.onopen = () => {
      console.log('WS connected');
      // Запросим текущий стейт на случай, если мы опоздали
      api('/api/game_state', { table_id: tableId })
        .then(renderState)
        .catch(()=>{});
    };

    ws.onmessage = ev => {
      const state = JSON.parse(ev.data);
      renderState(state);
    };

    ws.onclose = () => {
      console.warn('WS closed, reconnect in 3s');
      setTimeout(connectWS, 3000);
    };
  }
  connectWS();

  function renderState(state) {
    // Коммьюнити
    document.getElementById('community-cards').textContent =
      'Комьюнити: ' + (state.community.join(' ') || '—');
    // Ваши карты
    document.getElementById('your-cards').textContent =
      'Ваши карты: ' + ((state.hole_cards[userId]||[]).join(' ')||'—');
    // Банк
    document.getElementById('pot').textContent = 'Банк: ' + state.pot;
    // Игроки
    document.getElementById('players-area').textContent =
      'Игроки:\n' + Object.entries(state.stacks)
        .map(([uid,stk]) =>
          `#${uid}: ${stk}` +
          (Number(uid) === state.current_player ? ' ← ход' : '')
        ).join('\n');
    // Настроим инпут
    const inp = document.getElementById('bet-amount');
    inp.max = state.stacks[userId] || 0;
    inp.placeholder = `до ${inp.max}`;
  }

  // Обработка кликов по кнопкам
  document.getElementById('actions').onclick = e => {
    const act = e.target.dataset.action;
    if (!act || ws.readyState !== WebSocket.OPEN) return;
    if (act === 'bet') {
      const amt = Number(document.getElementById('bet-amount').value)||0;
      if (amt < 1) return alert('Введите сумму');
      ws.send(JSON.stringify({ user_id:userId, action:'bet', amount:amt }));
    } else {
      ws.send(JSON.stringify({ user_id:userId, action:act }));
    }
  };
});
