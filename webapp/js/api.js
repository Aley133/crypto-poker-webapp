// webapp/js/api.js
const BASE = '';

// Получить список столов
export async function listTables(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`);
  if (!res.ok) throw new Error(`listTables error ${res.status}`);
  return await res.json();
}

// Создать новый стол
export async function createTable(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`createTable error ${res.status}`);
  return await res.json();
}

// Присоединиться к столу: указываем tableId, userId, номер места и сумму депозита
export async function joinTable(tableId, userId, seat, deposit) {
  const params = new URLSearchParams({
    table_id: tableId,
    user_id: userId,
    seat,
    deposit,
  });
  const res = await fetch(`${BASE}/api/join?${params.toString()}`, {
    method: 'POST',
  });
  if (!res.ok) {
    // Попытка вытащить detail из JSON, если есть
    let errMsg = `joinTable error ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg = errJson.detail || errMsg;
    } catch {}
    throw new Error(errMsg);
  }
  return await res.json();
}

// Получить баланс пользователя
export async function getBalance(userId) {
  const res = await fetch(`${BASE}/api/balance?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`getBalance error ${res.status}`);
  return await res.json();
}

// Получить состояние игры по HTTP
export async function getGameState(tableId) {
  const res = await fetch(`${BASE}/api/game_state?table_id=${tableId}`);
  if (!res.ok) throw new Error(`getGameState error ${res.status}`);
  return await res.json();
}

export default {
  listTables,
  createTable,
  joinTable,
  getBalance,
  getGameState
};
