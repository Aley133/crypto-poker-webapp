export function renderTable(state, userId) {
  // --- Рисуем стол и слоты ---
  const tableEl = document.getElementById('poker-table');
  state.seats.forEach((seat, idx) => {
    const seatEl = document.querySelector(`#seat-${idx}`);
    if (!seatEl) return;
    // очищаем предыдущий контент
    seatEl.innerHTML = '';
    if (seat) {
      // если за столом есть игрок, рисуем его аватар, имя и стек
      seatEl.appendChild(renderPlayerElement(seat, state.stacks[seat]));
    } else {
      // пустое место — показываем кнопку SIT
      const btn = document.createElement('button');
      btn.textContent = 'SIT';
      btn.className = 'sit-btn';
      btn.onclick = async () => {
        // проверяем конфиг стола
        const cfg = window.currentTableConfig;
        if (!cfg) {
          alert('Конфигурация стола не загружена');
          return;
        }
        // запрашиваем депозит
        const promptText = `Введите депозит (${cfg.min_deposit}–${cfg.max_deposit}):`;
        const deposit = parseInt(prompt(promptText), 10);
        if (isNaN(deposit) || deposit < cfg.min_deposit || deposit > cfg.max_deposit) {
          alert('Неверный депозит');
          return;
        }
        // отправляем запрос на посадку
        try {
          const res = await fetch(`/api/join?table_id=${window.currentTableId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deposit, seat_idx: idx })
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
          }
        } catch (err) {
          alert('Ошибка при посадке: ' + err.message);
        }
      };
      seatEl.appendChild(btn);
    }
  });
}

function renderPlayerElement(playerId, stack) {
  const wrap = document.createElement('div');
  wrap.className = 'player';
  const nameEl = document.createElement('div');
  nameEl.className = 'player-info';
  nameEl.textContent = playerId;
  wrap.appendChild(nameEl);
  const stackEl = document.createElement('div');
  stackEl.className = 'player-stack';
  stackEl.textContent = stack;
  wrap.appendChild(stackEl);
  return wrap;
}
