export default function renderActions(container, state, userId, send) {
  container.innerHTML = '';
  const cb = state.current_bet || 0;
  const contrib = state.contributions?.[userId] || 0;
  const toCall = Math.max(0, cb - contrib);

  // Определяем, показывать ли Bet или Raise
  const showBet = state.allowed_actions.includes('bet');
  const showRaise = state.allowed_actions.includes('raise');

  // Кастомные подписи
  const actionTitles = {
    fold: 'Fold',
    call: toCall > 0 ? `Call ${toCall}` : 'Call',
    bet:  'Bet',
    raise: 'Raise', // Можно сделать Raise to XX, если нужно
    check: 'Check'
  };

  // Список кнопок, которые точно есть в покере
  const buttons = ['fold', 'call', 'bet', 'raise', 'check'];

  buttons.forEach(act => {
    // Не рендерим Bet и Raise одновременно!
    if ((act === 'bet' && !showBet) || (act === 'raise' && !showRaise)) return;

    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${act}`;
    btn.textContent = actionTitles[act];
    if (state.allowed_actions.includes(act)) {
      btn.disabled = false;
      if (act === 'bet') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: 20 }); // фиксированная сумма
      } else if (act === 'raise') {
        btn.onclick = () => send({ user_id: userId, action: act, amount: (cb + 20) }); // фиксированная сумма raise
      } else {
        btn.onclick = () => send({ user_id: userId, action: act });
      }
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}
