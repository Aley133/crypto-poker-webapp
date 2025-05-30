// webapp/js/actionsManager.js

// Храним отложенные (toggle) состояния для Fold и Call
let foldPending = false;
let callPending = false;

/**
 * Рисует кнопки действий и управляет их состояниями.
 * @param {HTMLElement} container – элемент .action-buttons-wrapper
 * @param {object} state – текущее состояние игры из WS
 * @param {string} userId – ваш идентификатор
 * @param {function} safeSend – функция для отправки WS-сообщений
 */
export default function renderActions(container, state, userId, safeSend) {
  const isMyTurn  = String(state.current_player) === String(userId);
  const contribs  = state.contributions    || {};
  const myContrib = contribs[userId]       || 0;
  const cb        = state.current_bet      || 0;
  const toCall    = cb - myContrib;
  const myStack   = (state.stacks?.[userId]) || 0;

  // 1) При вашем ходе — сначала отправляем отложенные действия
  if (isMyTurn) {
    if (foldPending) {
      foldPending = false;
      safeSend({ user_id: userId, action: 'fold' });
      return;  // дождёмся нового состояния от сервера
    }
    if (callPending && toCall > 0) {
      callPending = false;
      safeSend({ user_id: userId, action: 'call' });
      return;
    }
  }

  // 2) Очищаем контейнер
  container.innerHTML = '';

  // 3) Создаём четыре кнопки
  const btnFold  = document.createElement('button');
  const btnCheck = document.createElement('button');
  const btnCall  = document.createElement('button');
  const btnBet   = document.createElement('button');

  btnFold .textContent = 'Fold';
  btnCheck.textContent = 'Check';
  btnCall .textContent = toCall > 0 ? `Call ${toCall}` : 'Call';
  btnBet  .textContent = cb > 0 ? 'Raise' : 'Bet';

  // Добавляем базовый класс и нужный модификатор
  btnFold.className  = 'poker-action-btn fold';
  btnCheck.className = 'poker-action-btn check';
  btnCall.className  = 'poker-action-btn call';
  btnBet.className   = `poker-action-btn ${cb > 0 ? 'raise' : 'bet'}`;

  // Вставляем в контейнер
  [btnFold, btnCheck, btnCall, btnBet].forEach(b => container.appendChild(b));

  // 4) Назначаем обработчики
  // Fold — toggle
  btnFold.onclick = () => {
    foldPending = !foldPending;
    btnFold.classList.toggle('pressed', foldPending);
  };
  // Check — мгновенная отправка (только если toCall===0)
  btnCheck.onclick = () => {
    if (isMyTurn && toCall === 0) {
      safeSend({ user_id: userId, action: 'check' });
    }
  };
  // Call — toggle (только если toCall>0)
  btnCall.onclick = () => {
    if (toCall > 0) {
      callPending = !callPending;
      btnCall.classList.toggle('pressed', callPending);
    }
  };
  // Bet/Raise — мгновенная отправка
  btnBet.onclick = () => {
    if (!isMyTurn) return;
    const action = cb > 0 ? 'raise' : 'bet';
    const promptText = action === 'bet'
      ? 'Сколько поставить?'
      : `До какого размера рейз? (больше ${cb})`;
    const amount = parseInt(prompt(promptText), 10) || 0;
    safeSend({ user_id: userId, action, amount });
  };

  // 5) Устанавливаем disabled и классы .dimmed/.highlight
  const allBtns = [btnFold, btnCheck, btnCall, btnBet];

  if (!isMyTurn) {
    // Вне вашего хода: Fold & Call можно зажать, остальные отключены
    btnFold.disabled  = false;
    btnCall.disabled  = toCall <= 0;
    btnCheck.disabled = true;
    btnBet.disabled   = true;

    allBtns.forEach(b => {
      b.classList.add('dimmed');
      b.classList.remove('highlight');
    });
  } else {
    // Ваш ход:
    // Fold всегда активна
    btnFold.disabled = false;
    btnFold.classList.add('highlight');
    btnFold.classList.remove('dimmed');

    // Check vs Call
    if (toCall > 0) {
      btnCheck.disabled = true;
      btnCall.disabled  = myStack < toCall;

      btnCheck.classList.add('dimmed');
      btnCheck.classList.remove('highlight');
      btnCall.classList.add('highlight');
      btnCall.classList.remove('dimmed');
    } else {
      btnCall.disabled  = true;
      btnCheck.disabled = false;

      btnCall.classList.add('dimmed');
      btnCall.classList.remove('highlight');
      btnCheck.classList.add('highlight');
      btnCheck.classList.remove('dimmed');
    }

    // Bet/Raise: активна при наличии стека
    btnBet.disabled = myStack <= 0;
    btnBet.classList.add('highlight');
    btnBet.classList.remove('dimmed');
  }
}
