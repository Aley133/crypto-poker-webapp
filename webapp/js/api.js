// webapp/js/api.js
const BASE = '';

// Универсальная функция запроса
async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, options);
  let payload = null;
  try {
    payload = await res.json();
  } catch (e) {
    // Если нет JSON в ответе
  }
  if (!res.ok) {
    const errorMessage =
      (payload && (payload.detail || payload.message)) ||
      `${options.method || 'GET'} ${path} error ${res.status}`;
    throw new Error(errorMessage);
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
export async function joinTable(tableId, userId, seat, deposit) {
  const path = `/api/join`;
  const body = { table_id: tableId, user_id: userId, seat, deposit };
  return await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
