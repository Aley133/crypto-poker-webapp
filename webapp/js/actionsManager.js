// webapp/js/actionsManager.js

/**
 * Рендерит панель действий исходя из массива allowed_actions, присылаемого сервером.
 * Порядок кнопок: Fold, Call, Bet/Raise, Check
 * @param {HTMLElement} container  – .action-buttons-wrapper
 * @param {object}      state      – состояние игры из WS, содержит state.allowed_actions и state.current_bet, state.contributions
 * @param {string}      userId     – ваш user_id
 * @param {function}    sendAction – функция safeSend({ user_id, action, amount? })
 */
export default function renderActions(container, state, userId, sendAction) {
  if (!container || !state.allowed_actions) return;

  // Очистка
  container.innerHTML = '';

  // Параметры ставок
  const cb = state.current_bet || 0;
  const contrib = (state.contributions?.[userId] || 0);
  const toCall = Math.max(0, cb - contrib);

  // Кнопки в заданном порядке
  const order = ['fold','call','bet','raise','check'];
  order.forEach(action => {
    if (!state.allowed_actions.includes(action)) return;

    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${action}`;
    switch(action) {
      case 'fold':  btn.textContent = 'Fold';     break;
      case 'call':  btn.textContent = `Call ${toCall}`; break;
      case 'check': btn.textContent = 'Check';    break;
      case 'bet':   btn.textContent = 'Bet';      break;
      case 'raise': btn.textContent = 'Raise';    break;
    }

    btn.disabled = false; // доступна кнопка, если сервер её отправил
    btn.onclick   = () => {
      const payload = { user_id: userId, action };
      // Bet/Raise могут требовать amount, но Логика prompt может быть в ui_game.js
      sendAction(payload);
    };

    container.appendChild(btn);
  });
}
