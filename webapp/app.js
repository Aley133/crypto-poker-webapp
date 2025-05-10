(() => {
  const origin = window.location.origin;
  const params = new URLSearchParams(location.search);
  const userId = params.get('user_id');
  const username = decodeURIComponent(params.get('username') || '—');

  // ---------------- common ----------------
  function api(path, extra={}) {
    const qp = new URLSearchParams({ user_id: userId, ...extra });
    return fetch(`${path}?${qp}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      });
  }

  // ---------------- index.html ----------------
  if (location.pathname.endsWith('index.html') || location.pathname === '/' ) {
    document.getElementById('username').textContent = username;
    const balEl = document.getElementById('current-balance');
    const info  = document.getElementById('info');
    const level = document.getElementById('level-select');

    // обновляем баланс
    api('/api/balance').then(d => {
      balEl.textContent = d.balance.toFixed(2) + ' USDT';
    }).catch(()=>{});

    // депозит / вывод / история
    document.getElementById('deposit').onclick = () => {
      api('/api/deposit').then(d => {
        info.textContent = `📥 Адрес для пополнения:\n${d.address}`;
      }).catch(_=> info.textContent='Ошибка при депозите');
    };
    document.getElementById('withdraw').onclick = () => {
      api('/api/withdraw').then(d => {
        info.textContent = `📤 ${d.instructions}`;
      }).catch(_=> info.textContent='Ошибка при выводе');
    };
    document.getElementById('history').onclick = () => {
      api('/api/history').then(d => {
        info.textContent = d.history.length
          ? d.history.join('\n')
          : '📜 История пуста';
      }).catch(_=> info.textContent='Ошибка при получении истории');
    };

    // табы
    document.querySelectorAll('.tab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        if (t.dataset.tab === 'cash') loadCash();
        else if (t.dataset.tab === 'tournaments') loadTournaments();
        else info.textContent = 'Скоро…';
      };
    });

    // кеш-столы
    function loadCash() {
      info.textContent = 'Загрузка столов…';
      api('/api/tables', { level: level.value }).then(tables => {
        info.innerHTML = '';
        tables.forEach(t => {
          const div = document.createElement('div');
          div.className = 'table';
          div.innerHTML = `
            <strong>Стол ${t.id}</strong><br>
            SB/BB: ${t.small_blind}/${t.big_blind}<br>
            Бай-ин: ${t.buy_in} | Игроки: ${t.players}<br>
            <button data-id="${t.id}">Играть</button>
          `;
          info.appendChild(div);
          div.querySelector('button').onclick = () => {
            const url = `${origin}/game.html?user_id=${userId}&username=${encodeURIComponent(username)}&table_id=${t.id}`;
            if (window.Telegram && Telegram.WebApp) {
              Telegram.WebApp.openLink(url);
            } else {
              location.href = url;
            }
          };
        });
      }).catch(_ => {
        info.textContent = 'Ошибка при загрузке столов';
      });
    }

    // турниры
    function loadTournaments() {
      info.textContent = 'Загрузка турниров…';
      api('/api/tournaments').then(list => {
        info.innerHTML = '';
        list.forEach(tr => {
          const div = document.createElement('div');
          div.className = 'table';
          div.innerHTML = `
            <strong>${tr.name}</strong><br>
            Бай-ин: ${tr.buy_in} | ${tr.players}/${tr.max_players}<br>
            Статус: ${tr.status}<br>
            <button>Вступить</button>
          `;
          info.appendChild(div);
          div.querySelector('button').onclick = () => {
            api('/api/join_tournament', { tournament_id: tr.id })
              .then(()=> info.textContent='Вы в турнире!')
              .catch(e=> info.textContent=e.message||'Ошибка');
          };
        });
      }).catch(_=> info.textContent='Ошибка при загрузке турниров');
    }

    // стартуем
    loadCash();
  }

  // ---------------- game.html ----------------
  if (location.pathname.endsWith('game.html')) {
    const tableId = params.get('table_id');
    document.getElementById('table-id').textContent = tableId;
    document.getElementById('back').onclick = () => history.back();

    const commEl   = document.getElementById('community-cards');
    const yourEl   = document.getElementById('your-cards');
    const potEl    = document.getElementById('pot');
    const playersE = document.getElementById('players-area');
    const actionA  = document.getElementById('actions');

    // WebSocket
    const ws = new WebSocket((location.protocol==='https:'?'wss':'ws') 
      + '://' + location.host + `/ws/game/${tableId}`);

    ws.onmessage = evt => {
      const state = JSON.parse(evt.data);
      // community
      commEl.textContent = 'Комьюнити: ' + (state.community.join(' ') || '—');
      // ваши карты
      const cards = state.hole_cards[userId] || [];
      yourEl.textContent = 'Ваши карты: ' + (cards.join(' ')||'—');
      // банк/стек
      potEl.textContent = `Банк: ${state.pot}`;
      // игроки
      playersE.innerHTML = 'Игроки:<br>' +
        Object.entries(state.stacks).map(([uid,stk]) =>
          `#${uid}: ${stk} ${(uid==state.current_player)?'<b>(ход)</b>':''}`
        ).join('<br>');
    };

    // кнопки действий
    actionA.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.action;
        const amt = document.getElementById('bet-amount').value;
        ws.send(JSON.stringify({ user_id: +userId, action: act, amount: +amt }));
      };
    });
  }
})();

