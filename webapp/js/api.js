// webapp/js/api.js
const BASE = '';

/**
 * Универсальная обёртка для fetch с обработкой ошибок и JSON
 */
async function request(method, path) {
  const res = await fetch(`${BASE}${path}`, { method });
  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) {
    const errMsg = (payload && (payload.detail || payload.message)) || `${method} ${path} error ${res.status}`;
    throw new Error(errMsg);
  }
  return payload;
}

/** Получить список столов по уровню */
export async function listTables(level) {
  const path = `/api/tables?level=${encodeURIComponent(level)}`;
  return await request('GET', path);
}

/** Создать новый стол по уровню */
export async function createTable(level) {
  const path = `/api/tables?level=${encodeURIComponent(level)}`;
  return await request('POST', path);
}

/**
 * Присоединиться к столу с местом и депозитом (через query-параметры)
 * @param {number|string} tableId
 * @param {string} userId
 * @param {number} seat
 * @param {number} deposit
 */
export async function joinTable(tableId, userId, seat, deposit) {
  // Проверяем, что все параметры переданы
  if ([tableId, userId, seat, deposit].some(x => x == null)) {
    throw new Error('joinTable: missing tableId/userId/seat/deposit');
  }
  // Отправляем данные в теле POST-запроса в формате JSON
  return await request('POST', `/api/join`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: tableId, user_id: userId, seat, deposit })
  });
}

/** Получить баланс пользователя */
export async function getBalance(userId) {
  const path = `/api/balance?user_id=${encodeURIComponent(userId)}`;
  return await request('GET', path);
}

/** Получить состояние игры по HTTP */
export async function getGameState(tableId) {
  const path = `/api/game_state?table_id=${encodeURIComponent(tableId)}`;
  return await request('GET', path);
}

export default {
  listTables,
  createTable,
  joinTable,
  getBalance,
  getGameState
};
