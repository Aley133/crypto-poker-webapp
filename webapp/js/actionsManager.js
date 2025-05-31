export default function renderActions(container, state, userId, send) {
  container.innerHTML = '';
  const cb = state.current_bet || 0;
  const contrib = state.contributions?.[userId] || 0;
  const toCall = Math.max(0, cb - contrib);

  // Кастомные подписи
  const actionTitles = {
    fold: 'Fold',
    call: toCall > 0 ? `Call ${toCall}` : 'Call',
    bet:  'Bet',
    raise: 'Raise',
    check: 'Check'
  };

  // Список кнопок всегда одинаковый
  ['fold','call','bet','raise','check'].forEach(act => {
    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${act}`;
    btn.textContent = actionTitles[act];
    if (state.allowed_actions.includes(act)) {
      btn.disabled = false;
      if (act === 'bet') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: 20 });
      } else if (act === 'raise') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: (cb + 20) });
      } else {
        btn.onclick = () => send({ user_id: userId, action: act });
      }
    } else {
      btn.disabled = true;
      btn.onclick = null;
    }
    container.appendChild(btn);
  });
}
