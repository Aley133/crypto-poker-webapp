// webapp/js/actionsManager.js

// Хранит отложенное действие ('fold' или 'call')
let pendingAction = null;

/**
 * Рендерит и управляет кнопками действий игрока.
 *
 * @param {HTMLElement} container — элемент .action-buttons-wrapper
 * @param {object} state          — текущее состояние игры
 * @param {string|number} userId  — ваш идентификатор
 * @param {function} sendCallback — функция для отправки действия на сервер
 */
export default function renderActions(container, state, userId, sendCallback) {
  if (!container) return;

  // Вычисляем вклад и стек пользователя
  const contributions = state.contributions || {};
  const stacks        = state.stacks        || {};
  const userContribution = contributions[userId] || 0;
  const userStack        = stacks[userId]       || 0;

  // Проверяем, ваш ли сейчас ход
  const isMyTurn = String(state.current_player) === String(userId);

  // Если наступил ваш ход и есть отложенное действие — отправляем его
  if (isMyTurn && pendingAction) {
    const actionToSend = pendingAction;
    pendingAction = null;
    sendCallback(actionToSend);
    return;
  }

  // Очищаем контейнер перед новой отрисовкой
  container.innerHTML = '';

  // Считаем параметры ставок
  const currentBet = state.current_bet || 0;
  const toCall     = Math.max(0, currentBet - userContribution);
  const canCall    = toCall > 0 && userStack >= toCall;
  const canCheck   = toCall === 0;
  const noBetYet   = currentBet === 0;
  const canBet     = noBetYet && userStack > 0;
  const canRaise   = !noBetYet && userStack > toCall;

  // --- Создаем кнопки ---
  const btnFold  = document.createElement('button');
  const btnCall  = document.createElement('button');
  const btnCheck = document.createElement('button');
  const btnBet   = document.createElement('button');
  const btnRaise = document.createElement('button');

  btnFold .textContent = 'Fold';
  btnCall .textContent = canCall ? `Call ${toCall}` : 'Call';
  btnCheck.textContent = 'Check';
  btnBet  .textContent = 'Bet';
  btnRaise.textContent = 'Raise';

  btnFold .className = 'poker-action-btn fold';
  btnCall .className = 'poker-action-btn call';
  btnCheck.className = 'poker-action-btn check';
  btnBet  .className = 'poker-action-btn bet';
  btnRaise.className = 'poker-action-btn raise';

  container.append(btnFold, btnCall, btnCheck, btnBet, btnRaise);

  // --- Обработчики ---

  // Fold: toggle в любое время
  btnFold.onclick = () => {
    if (!isMyTurn) {
      pendingAction = pendingAction === 'fold' ? null : 'fold';
      btnFold.classList.toggle('pressed', pendingAction === 'fold');
    } else {
      sendCallback('fold');
      disableAll(container);
    }
  };

  // Call: toggle, если можно коллить
  btnCall.onclick = () => {
    if (!isMyTurn) {
      if (canCall) {
        pendingAction = pendingAction === 'call' ? null : 'call';
        btnCall.classList.toggle('pressed', pendingAction === 'call');
      }
    } else if (canCall) {
      sendCallback('call');
      disableAll(container);
    }
  };

  // Check: мгновенно, только в ваш ход и если можно
  btnCheck.onclick = () => {
    if (isMyTurn && canCheck) {
      sendCallback('check');
      disableAll(container);
    }
  };

  // Bet: мгновенно, только в ваш ход и если можно
  btnBet.onclick = () => {
    if (isMyTurn && canBet) {
      sendCallback('bet');
      disableAll(container);
    }
  };

  // Raise: мгновенно, только в ваш ход и если можно
  btnRaise.onclick = () => {
    if (isMyTurn && canRaise) {
      sendCallback('raise');
      disableAll(container);
    }
  };

  // --- Активность и стили ---

  // Fold всегда доступна
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
    // Ваш ход: подсветка доступных действий
    btnFold.classList.add('highlight');

    if (canCall) {
      btnCall.disabled = false;
      btnCall.classList.add('highlight');
    } else {
      btnCall.disabled = true;
      btnCall.classList.add('dimmed');
    }

    if (canCheck) {
      btnCheck.disabled = false;
      btnCheck.classList.add('highlight');
    } else {
      btnCheck.disabled = true;
      btnCheck.classList.add('dimmed');
    }

    if (canBet) {
      btnBet.disabled = false;
      btnBet.classList.add('highlight');
    } else {
      btnBet.disabled = true;
      btnBet.classList.add('dimmed');
    }

    if (canRaise) {
      btnRaise.disabled = false;
      btnRaise.classList.add('highlight');
    } else {
      btnRaise.disabled = true;
      btnRaise.classList.add('dimmed');
    }
  }
}

// Блокируем все кнопки в контейнере
function disableAll(container) {
  container.querySelectorAll('button').forEach(b => b.disabled = true);
}
