// webapp/js/actionsManager.js

/**
 * Рендерит панель действий по списку state.allowed_actions.
 * Порядок: Fold, Call, Bet→Raise, Check.
 */
export default function renderActions(container, state, userId, send) {
  container.innerHTML = '';
  const cb = state.current_bet||0;
  const contrib = state.contributions?.[userId]||0;
  const toCall = Math.max(0,cb-contrib);
  const order = ['fold','call','bet','raise','check'];
  order.forEach(act => {
    if (!state.allowed_actions.includes(act)) return;
    const btn = document.createElement('button');
    btn.className = `poker-action-btn ${act}`;
    switch(act) {
      case 'fold':  btn.textContent = 'Fold'; break;
      case 'call':  btn.textContent = `Call ${toCall}`; break;
      case 'bet':   btn.textContent = 'Bet';  break;
      case 'raise': btn.textContent = 'Raise'; break;
      case 'check': btn.textContent = 'Check'; break;
    }
    btn.disabled = false;
    btn.onclick  = () => send({ user_id: userId, action: act });
    container.appendChild(btn);
  });
}
