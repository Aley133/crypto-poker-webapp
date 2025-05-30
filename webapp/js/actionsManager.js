// webapp/js/actionsManager.js

/**
 * Рендерит панель действий по списку state.allowed_actions.
 * Порядок: Fold, Call, Bet→Raise, Check.
 */
export default function renderActions(container, state, userId, sendAction) {
  if (!container || !Array.isArray(state.allowed_actions)) return;

  // Предварительные toggle-состояния (Fold/Call вне хода)
  container._toggles = container._toggles || { fold: false, call: false };
  const toggles = container._toggles;

  const isMyTurn = String(state.current_player) === String(userId);
  const cb       = state.current_bet || 0;
  const contrib  = state.contributions?.[userId] || 0;
  const toCall   = Math.max(0, cb - contrib);

  container.innerHTML = '';

  const order = ['fold','call','bet','raise','check'];
  order.forEach(action => {
    if (!state.allowed_actions.includes(action)) return;

    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${action}`;
    // Текст
    if      (action === 'fold')  btn.textContent = 'Fold';
    else if (action === 'call')  btn.textContent = `Call ${toCall}`;
    else if (action === 'bet')   btn.textContent = 'Bet';
    else if (action === 'raise') btn.textContent = 'Raise';
    else if (action === 'check') btn.textContent = 'Check';

    // Доступность
    let disabled = false;
    if (!isMyTurn && !['fold','call'].includes(action)) {
      disabled = true;  // вне хода только Fold/Call toggleable
    }
    btn.disabled = disabled;

    // Стили
    if (disabled) {
      btn.classList.add('dimmed');
    } else if (isMyTurn) {
      btn.classList.add('highlight');
    }
    // Пресованный state для Fold/Call toggle
    if (!isMyTurn && (action === 'fold' || action === 'call')) {
      if (toggles[action]) btn.classList.add('pressed');
    }

    // Клик
    btn.onclick = () => {
      if (!isMyTurn && (action === 'fold' || action === 'call')) {
        // toggle вне хода
        toggles[action] = !toggles[action];
        btn.classList.toggle('pressed', toggles[action]);
        return;
      }
      if (disabled) return;
      sendAction({ user_id: userId, action });
    };

    container.appendChild(btn);
  });
}
