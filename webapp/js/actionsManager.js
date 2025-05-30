// webapp/js/actionsManager.js

// Хранит отложенное действие ('fold' или 'call')
let pendingAction = null;

/**
 * Рендерит панель действий игрока: Fold, Call, Bet↔Raise, Check.
 *
 * @param {HTMLElement} container  – ваш .action-buttons-wrapper
 * @param {object}      state      – состояние игры из WS
 * @param {string|number} userId   – ваш user_id
 * @param {function}    sendAction – функция safeSend(payload)
 */
export default function renderActions(container, state, userId, sendAction) {
  if (!container) return;

  // Определяем, ваш ли ход
  const isMyTurn = String(state.current_player) === String(userId);

  // Если ваш ход и есть отложенное действие — отправляем его
  if (isMyTurn && pendingAction) {
    sendAction({ user_id: userId, action: pendingAction });
    pendingAction = null;
    return;
  }

  // Очищаем контейнер
  container.innerHTML = '';

  // Получаем вклад и стек игрока
  const contributions = state.contributions || {};
  const stacks        = state.stacks        || {};
  const myContrib     = contributions[userId] || 0;
  const myStack       = stacks[userId]        || 0;

  // Считаем currentBet и toCall
  const currentBet = state.current_bet || 0;
  const toCall     = Math.max(0, currentBet - myContrib);

  const canCall  = toCall > 0 && myStack >= toCall;
  const canCheck = toCall === 0;
  const noBet    = currentBet === 0;
  const canBet   = noBet && myStack > 0;
  const canRaise = currentBet > 0 && myStack > toCall;

  // Создаем кнопки
  const btnFold  = document.createElement('button');('button');
  const btnCall  = document.createElement('button');
  const btnBet   = document.createElement('button');
  const btnCheck = document.createElement('button');

  btnFold.textContent  = 'Fold';
  btnCall.textContent  = canCall ? `Call ${toCall}` : 'Call';
  btnBet.textContent   = currentBet > 0 ? 'Raise' : 'Bet';
  btnCheck.textContent = 'Check';

  // Присваиваем классы
  btnFold.className  = 'poker-action-btn fold';
  btnCall.className  = 'poker-action-btn call';
  btnBet.className   = currentBet > 0 ? 'poker-action-btn poker-action-raise' : 'poker-action-btn poker-action-bet';
  btnCheck.className = 'poker-action-btn check';

  // Добавляем в контейнер в порядке fold, call, bet, check
  container.append(btnFold, btnCall, btnBet, btnCheck);

  // Обработчики кликов
  btnFold.onclick = () => {
    if (!isMyTurn) {
      pendingAction = pendingAction === 'fold' ? null : 'fold';
      btnFold.classList.toggle('pressed', pendingAction === 'fold');
    } else {
      sendAction({ user_id: userId, action: 'fold' });
      disableAll(container);
    }
  };

  btnCall.onclick = () => {
    if (!isMyTurn) {
      if (canCall) {
        pendingAction = pendingAction === 'call' ? null : 'call';
        btnCall.classList.toggle('pressed', pendingAction === 'call');
      }
    } else if (canCall) {
      sendAction({ user_id: userId, action: 'call' });
      disableAll(container);
    }
  };

  btnCheck.onclick = () => {
    if (isMyTurn && canCheck) {
      sendAction({ user_id: userId, action: 'check' });
      disableAll(container);
    }
  };

  btnBet.onclick = () => {
    if (!isMyTurn) return;
    const action = currentBet > 0 ? 'raise' : 'bet';
    sendAction({ user_id: userId, action });
    disableAll(container);
  };

  // Устанавливаем disabled и стили
  btnFold.disabled = false;

  if (!isMyTurn) {
    btnCall.disabled  = !canCall;
    btnCheck.disabled = true;
    btnBet.disabled   = true;
    [btnCall, btnCheck, btnBet].forEach(b => b.classList.add('dimmed'));
  } else {
    btnFold.classList.add('highlight');

    btnCall.disabled = !canCall;
    btnCall.classList.add(canCall ? 'highlight' : 'dimmed');

    btnCheck.disabled = !canCheck;
    btnCheck.classList.add(canCheck ? 'highlight' : 'dimmed');

    if (currentBet > 0) {
      btnBet.disabled = !canRaise;
      btnBet.classList.add(canRaise ? 'highlight' : 'dimmed');
    } else {
      btnBet.disabled = !canBet;
      btnBet.classList.add(canBet ? 'highlight' : 'dimmed');
    }
  }
}

// Блокирует все кнопки внутри контейнера
function disableAll(container) {
  container.querySelectorAll('button').forEach(btn => btn.disabled = true);
}
