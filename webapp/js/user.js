// webapp/js/user.js

/**
 * Initialize Telegram WebApp data and store it globally.
 */
export function initTelegramData() {
  window.initData = window.Telegram?.WebApp?.initData || '';
  if (window.Telegram?.WebApp?.ready) {
    window.Telegram.WebApp.ready();
  }
}

// Generate random user id if none provided
function generateId() {
  return 'user_' + [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Retrieve user_id and username from URL parameters or localStorage.
 * If not present, generates a new id and stores it.
 */
export function getUserInfo() {
  const params = new URLSearchParams(window.location.search);
  let uid = params.get('user_id') || localStorage.getItem('user_id');
  let uname = params.get('username') || localStorage.getItem('username');

  if (params.get('user_id')) {
    localStorage.setItem('user_id', uid);
  }
  if (params.get('username')) {
    localStorage.setItem('username', uname);
  }

  if (!uid) {
    uid = generateId();
    localStorage.setItem('user_id', uid);
  }
  if (!uname) {
    uname = uid;
    localStorage.setItem('username', uname);
  }

  return { userId: uid, username: uname };
}
