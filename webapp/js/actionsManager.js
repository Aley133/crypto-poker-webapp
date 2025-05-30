// webapp/js/actionsManager.js

// Предварительно выбранные действия (toggle) вне вашего хода
let foldPending = false;
let callPending = false;

/**
 * Рендерит панель действий игрока: Fold, Check, Call, Bet↔Raise.
 * Сохраняет логику original ui_game.js, добавляя возможность toggle для Fold и Call.
 *
 * @param {HTMLElement} container – .action-buttons-wrapper
 * @param {object}      state     – текущее состояние игры
 * @param {string}      userId    – ваш user_id
 * @param {function}    safeSend  – функция safeSend из ui_game.js
 */
export default function renderActions(container, state, userId, safeSend) {
  if (!container) return;

  // 1) Проверяем, наш ли сейчас ход
  const isMyTurn = String(state.current_player) === String(userId);

  // 2) Если наступил наш ход и есть pending, отправляем его сразу
  if (isMyTurn && foldPending) {
    foldPending = false;
    safeSend({ user_id: userId, action: 'fold' });
    return;
  }
  if (isMyTurn && callPending) {
    callPending = false;
    safeSend({ user_id: userId, action: 'call' });
    return;
  }

  // 3) Очищаем контейнер перед перерисовкой
  container.innerHTML = '';

  // 4) Вычисляем параметры ставок
  const contribs = state.contributions || {};
  const stacks  = state.stacks        || {};
  const myContrib = contribs[userId] || 0;
  const myStack   = stacks[userId]    || 0;
  const cb        = state.current_bet || 0;
  const toCall    = cb - myContrib;

  // Условие доступности
  const canCall  = toCall > 0 && myStack >= toCall;
  const canCheck = toCall === 0;
  const noBetYet = cb === 0;
  const canBet   = noBetYet && myStack > 0;
  const canRaise = cb > 0 && myStack > toCall;

  // 5) Создаём пять кнопок
  const btnFold  = document.createElement('button');
  const btnCheck = document.createElement('button');
  const btnCall  = document.createElement('button');
  const btnBet   = document.createElement('button');
  const btnRaise = document.createElement('button');

  btnFold.textContent  = 'Fold';
  btnCheck.textContent = 'Check';
  btnCall.textContent  = canCall ? `Call ${toCall}` : 'Call';
  btnBet.textContent   = 'Bet';
  btnRaise.textContent = 'Raise';

  // Назначаем базовые классы (можете скорректировать под ваши CSS)
  btnFold.className  = 'poker-action-btn poker-action-fold';
  btnCheck.className = 'poker-action-btn';
  btnCall.className  = 'poker-action-btn';
  btnBet.className   = 'poker-action-btn poker-action-bet';
  btnRaise.className = 'poker-action-btn poker-action-raise';

  // Добавляем в контейнер
  [btnFold, btnCheck, btnCall, btnBet, btnRaise].forEach(b => container.appendChild(b));

  // 6) Обработчики клика

  // Fold: toggle если вне хода, иначе instant send
  btnFold.onclick = () => {
    if (!isMyTurn) {
      foldPending = !foldPending;
      btnFold.classList.toggle('pressed', foldPending);
    } else {
      safeSend({ user_id: userId, action: 'fold' });
      disableAll(container);
    }
  };

  // Call: toggle вне хода, instant send в свой ход
  btnCall.onclick = () => {
    if (!isMyTurn) {
      if (canCall) {
        callPending = !callPending;
        btnCall.classList.toggle('pressed', callPending);
      }
    } else if (canCall) {
      safeSend({ user_id: userId, action: 'call' });
      disableAll(container);
    }
  };

  // Check: только instant в свой ход
  btnCheck.onclick = () => {
    if (isMyTurn && canCheck) {
      safeSend({ user_id: userId, action: 'check' });
      disableAll(container);
    }
  };

  // Bet: instant в свой ход
  btnBet.onclick = () => {
    if (isMyTurn && canBet) {
      safeSend({ user_id: userId, action: 'bet' });
      disableAll(container);
    }
  };

  // Raise: instant в свой ход
  btnRaise.onclick = () => {
    if (isMyTurn && canRaise) {
      safeSend({ user_id: userId, action: 'raise' });
      disableAll(container);
    }
  };

  // 7) Устанавливаем disabled / классы .dimmed / .highlight

  // Fold всегда доступна, не дизейблится
  btnFold.disabled = false;

  if (!isMyTurn) {
    // Вне вашего хода: можно toggle Fold/Call, остальные отключены
    btnCall.disabled  = !canCall;
    btnCheck.disabled = true;
    btnBet.disabled   = true;
    btnRaise.disabled = true;

    [btnCall, btnCheck, btnBet, btnRaise].forEach(b => {
      b.classList.add('dimmed');
      b.classList.remove('highlight');
    });
  } else {
    // В ваш ход: подсветка доступных кнопок
    btnFold.classList.add('highlight');

    if (canCall) {
      btnCall.disabled = false;
      btnCall.classList.add('highlight');
      btnCall.classList.remove('dimmed');
    } else {
      btnCall.disabled = true;
      btnCall.classList.add('dimmed');
      btnCall.classList.remove('highlight');
    }

    if (canCheck) {
      btnCheck.disabled = false;
      btnCheck.classList.add('highlight');
      btnCheck.classList.remove('dimmed');
    } else {
      btnCheck.disabled = true;
      btnCheck.classList.add('dimmed');
      btnCheck.classList.remove('highlight');
    }

    if (canBet) {
      btnBet.disabled = false;
      btnBet.classList.add('highlight');
      btnBet.classList.remove('dimmed');
    } else {
      btnBet.disabled = true;
      btnBet.classList.add('dimmed');
      btnBet.classList.remove('highlight');
    }

    if (canRaise) {
      btnRaise.disabled = false;
      btnRaise.classList.add('highlight');
      btnRaise.classList.remove('dimmed');
    } else {
      btnRaise.disabled = true;
      btnRaise.classList.add('dimmed');
      btnRaise.classList.remove('highlight');
    }
  }
}

// Вспомогательная функция: блокирует все кнопки
function disableAll(container) {
  container.querySelectorAll('button').forEach(btn => btn.disabled = true);
}
