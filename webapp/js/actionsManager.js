// webapp/js/actionsManager.js

/**
 * Рендерит панель действий: всегда 5 кнопок, активные только из allowed_actions.
 * Fold, Call, Bet, Raise, Check — все на месте.
 */
export default function renderActions(container, state, userId, send) {
  container.innerHTML = '';
  const cb = state.current_bet || 0;
  const contrib = state.contributions?.[userId] || 0;
  const toCall = Math.max(0, cb - contrib);

  // Для кастомных подписей (например, "Call 20", "Raise to 50")
  const actionTitles = {
    fold: 'Fold',
    call: toCall > 0 ? `Call ${toCall}` : 'Call',
    bet:  'Bet',
    raise: cb > 0 ? `Raise` : 'Raise', // Можно добавить сумму или min-raise, если потребуется
    check: 'Check'
  };

  ['fold','call','bet','raise','check'].forEach(act => {
    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${act}`;
    btn.textContent = actionTitles[act];
    if (state.allowed_actions.includes(act)) {
      btn.disabled = false;
      if (act === 'bet') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: 20 }); // фиксированная ставка
      } else if (act === 'raise') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: (cb + 20) }); // фиксированный raise
      } else {
        btn.onclick = () => send({ user_id: userId, action: act });
      }
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}
