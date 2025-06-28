// webapp/js/api.js
const BASE = '';

/**
 * Универсальная обёртка для fetch с обработкой ошибок и JSON
 */
async function request(method, path) {
  const res = await fetch(`${BASE}${path}`, { method });
  let payload = null;
  try {
    payload = await res.json();
  } catch {}
  if (!res.ok) {
    const errMsg = (payload && (payload.detail || payload.message)) || `${method} ${path} error ${res.status}`;
    throw new Error(errMsg);
  }
  return payload;
}

/** Получить список столов по уровню */
export async function listTables(level) {
  return await request('GET', `/api/tables?level=${encodeURIComponent(level)}`);
}

/** Создать новый стол по уровню */
export async function createTable(level) {
  return await request('POST', `/api/tables?level=${encodeURIComponent(level)}`);
}

/**
 * Присоединиться к столу с местом и депозитом (через query-параметры)
 * @param {number|string} tableId
 * @param {string} userId
 * @param {number} seat
 * @param {number} deposit
 */
export async function joinTable(tableId, userId, seat, deposit) {
  if ([tableId, userId, seat, deposit].some(x => x == null)) {
    throw new Error('joinTable: missing tableId/userId/seat/deposit');
  }
  const params = new URLSearchParams({
    table_id: tableId,
    user_id:  userId,
    seat:     seat,
    deposit:  deposit
  });
  return await request('POST', `/api/join?${params.toString()}`);
}

/** Получить баланс пользователя */
export async function getBalance(userId) {
  return await request('GET', `/api/balance?user_id=${encodeURIComponent(userId)}`);
}

/** Получить состояние игры по HTTP */
export async function getGameState(tableId) {
  return await request('GET', `/api/game_state?table_id=${encodeURIComponent(tableId)}`);
}

export default {
  listTables,
  createTable,
  joinTable,
  getBalance,
  getGameState
};
