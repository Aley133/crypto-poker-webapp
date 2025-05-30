
// actionsManager.js

let foldToggle = false;
let callToggle = false;

/**
 * Рисует 4 кнопки (Fold, Check, Call, Bet/Raise) и управляет их состояниями.
 * @param {HTMLElement} container — .action-buttons-wrapper
 * @param {object} state — текущее состояние игры из сервера
 * @param {string} userId — ваш user_id
 * @param {function} safeSend — функция для отправки WS
 */
export default function renderActions(container, state, userId, safeSend) {
  const cb        = state.current_bet || 0;
  const contribs  = state.contributions || {};
  const myContrib = contribs[userId] || 0;
  const toCall    = cb - myContrib;
  const stacks    = state.stacks || {};
  const myStack   = stacks[userId] || 0;
  const isMyTurn  = String(state.current_player) === String(userId);

  // Очищаем контейнер
  container.innerHTML = '';

  // 1) Fold (toggleable, всегда кликабелен)
  const btnFold = document.createElement('button');
  btnFold.textContent = 'Fold';
  btnFold.className = 'poker-action-btn fold';
  btnFold.onclick = () => {
    foldToggle = !foldToggle;
    btnFold.classList.toggle('pressed', foldToggle);
  };

  // 2) Check (импульсная отправка, только когда toCall === 0)
  const btnCheck = document.createElement('button');
  btnCheck.textContent = 'Check';
  btnCheck.className = 'poker-action-btn check';
  btnCheck.onclick = () => safeSend({ user_id: userId, action: 'check' });

  // 3) Call (toggleable, доступен если toCall > 0)
  const btnCall = document.createElement('button');
  btnCall.textContent = `Call ${toCall > 0 ? toCall : ''}`;
  btnCall.className = 'poker-action-btn call';
  btnCall.onclick = () => {
    if (toCall > 0) {
      callToggle = !callToggle;
      btnCall.classList.toggle('pressed', callToggle);
    }
  };

  // 4) Bet / Raise (импульсная отправка)
  const isRaise = cb > 0;
  const btnBet = document.createElement('button');
  btnBet.textContent = isRaise ? 'Raise' : 'Bet';
  btnBet.className = `poker-action-btn ${isRaise ? 'raise' : 'bet'}`;
  btnBet.onclick = () => {
    const action = isRaise ? 'raise' : 'bet';
    const promptText = action === 'bet'
      ? 'Сколько поставить?'
      : `До какого размера рейз? (больше ${cb})`;
    const amount = parseInt(prompt(promptText), 10) || 0;
    safeSend({ user_id: userId, action, amount });
  };

  // Собираем кнопки и вставляем
  [btnFold, btnCheck, btnCall, btnBet].forEach(btn => container.appendChild(btn));

  // --- Управление enabled/disabled и классами dimmed/highlight ---

  if (!isMyTurn) {
    // Когда не ваш ход: 
    // • Fold всегда кликабелен, но выглядит dimmed
    // • Call кликабелен только если toCall > 0, выглядит dimmed
    // • Check и Bet/Raise полностью отключены
    btnFold.disabled  = false;
    btnCall.disabled  = toCall <= 0;
    btnCheck.disabled = true;
    btnBet.disabled   = true;

    [btnFold, btnCall, btnCheck, btnBet].forEach(b => {
      b.classList.add('dimmed');
      b.classList.remove('highlight');
    });
  } else {
    // Ваш ход:
    // Fold — всегда активен
    // Check/Call — в зависимости от toCall
    // Bet/Raise — если у вас есть фишки
    btnFold.disabled  = false;
    btnFold.classList.add('highlight');
    btnFold.classList.remove('dimmed');

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

    btnBet.disabled = myStack <= 0;
    btnBet.classList.add('highlight');
    btnBet.classList.remove('dimmed');
  }

  // Если наступил ваш ход и есть отложенные toggles — отправляем их
  if (isMyTurn) {
    if (foldToggle) {
      foldToggle = false;
      safeSend({ user_id: userId, action: 'fold' });
    } else if (callToggle && toCall > 0) {
      callToggle = false;
      safeSend({ user_id: userId, action: 'call' });
    }
  }
}
