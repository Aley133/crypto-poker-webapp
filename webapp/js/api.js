// webapp/js/api.js
const BASE = '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  let payload = null;
  try { payload = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (payload && (payload.detail||payload.message)) 
      || `${options.method||'GET'} ${path} error ${res.status}`;
    throw new Error(msg);
  }
  return payload;
}

/**
 * Получить список столов по уровню
 * @param {string} level
 * @returns {Promise<{tables: Array}>}
 */
export async function listTables(level) {
  const path = `/api/tables?level=${encodeURIComponent(level)}`;
  return await request(path);
}

/**
 * Создать новый стол по уровню
 * @param {string} level
 * @returns {Promise<Object>} данные созданного стола
 */
export async function createTable(level) {
  const path = `/api/tables?level=${encodeURIComponent(level)}`;
  return await request(path, { method: 'POST' });
}

/**
 * Присоединиться к столу
 * @param {number|string} tableId
 * @param {string} userId
 * @param {number} seat
 * @param {number} deposit
 * @returns {Promise<Object>} ответ сервера
 */
/** Присоединиться к столу */
export async function joinTable(tableId, userId, seat, deposit) {
  // убедимся, что все параметры не undefined
  if ([tableId, userId, seat, deposit].some(x => x == null)) {
    throw new Error('joinTable: missing tableId/userId/seat/deposit');
  }
  const params = new URLSearchParams({
    table_id: tableId,
    user_id:   userId,
    seat:      seat,
    deposit:   deposit
  });
  return await request(`/api/join?${params.toString()}`, {
    method: 'POST'
  });
}

/**
 * Получить баланс пользователя
 * @param {string} userId
 * @returns {Promise<{balance: number}>}
 */
export async function getBalance(userId) {
  const path = `/api/balance?user_id=${encodeURIComponent(userId)}`;
  return await request(path);
}

/**
 * Получить состояние игры по HTTP (альтернатива WebSocket)
 * @param {number|string} tableId
 * @returns {Promise<Object>} состояние игры
 */
export async function getGameState(tableId) {
  const path = `/api/game_state?table_id=${encodeURIComponent(tableId)}`;
  return await request(path);
}

export default {
  listTables,
  createTable,
  joinTable,
  getBalance,
  getGameState,
};
