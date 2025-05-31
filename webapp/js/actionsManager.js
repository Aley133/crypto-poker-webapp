export default function renderActions(container, state, userId, send) {
  container.innerHTML = '';
  const cb = state.current_bet || 0;
  const contrib = state.contributions?.[userId] || 0;
  const toCall = Math.max(0, cb - contrib);
  const stack = state.stacks?.[userId] || 0;

  // Правила минимальных ставок (можешь поменять)
  const minBet = 20; // или 2BB — подставь как у тебя принято
  const minRaise = cb > 0 ? cb * 2 : minBet;
  const maxRaise = stack + contrib;

  const actionTitles = {
    fold: 'Fold',
    call: toCall > 0 ? `Call ${toCall}` : 'Call',
    bet:  'Bet',
    raise: 'Raise',
    check: 'Check'
  };

  // Храним выбранную сумму в инпутах, по умолчанию минимум
  let betValue = minBet;
  let raiseValue = minRaise;

  // Создаём обёртку
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.gap = '12px';

  ['fold','call','bet','raise','check'].forEach(act => {
    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${act}`;
    btn.textContent = actionTitles[act];
    let input;

    if (state.allowed_actions.includes(act)) {
      btn.disabled = false;

      // === BET ===
      if (act === 'bet') {
        input = document.createElement('input');
        input.type = 'number';
        input.min = minBet;
        input.max = stack + contrib;
        input.step = 1;
        input.value = betValue;
        input.style.width = '70px';
        input.oninput = e => {
          betValue = Math.max(minBet, Math.min(stack + contrib, parseInt(e.target.value) || minBet));
        };
        btn.onclick = () => send({ user_id: userId, action: act, amount: parseInt(input.value) });
      }

      // === RAISE ===
      else if (act === 'raise') {
        input = document.createElement('input');
        input.type = 'number';
        input.min = minRaise;
        input.max = stack + contrib;
        input.step = 1;
        input.value = raiseValue;
        input.style.width = '70px';
        input.oninput = e => {
          raiseValue = Math.max(minRaise, Math.min(stack + contrib, parseInt(e.target.value) || minRaise));
        };
        btn.onclick = () => send({ user_id: userId, action: act, amount: parseInt(input.value) });
      }

      // === Остальные кнопки ===
      else {
        btn.onclick = () => send({ user_id: userId, action: act });
      }
    } else {
      btn.disabled = true;
    }

    // Рендерим input рядом с Bet/Raise (если активен)
    const wrapperBtn = document.createElement('div');
    wrapperBtn.style.display = 'inline-flex';
    wrapperBtn.style.alignItems = 'center';
    wrapperBtn.style.gap = '4px';
    wrapperBtn.appendChild(btn);
    if (input) wrapperBtn.appendChild(input);
    wrapper.appendChild(wrapperBtn);
  });

  container.appendChild(wrapper);
}
