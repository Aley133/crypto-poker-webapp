// webapp/js/api.js
const BASE = '';

export async function listTables(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`);
  if (!res.ok) throw new Error(`listTables error ${res.status}`);
  return await res.json();
}

export async function createTable(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`createTable error ${res.status}`);
  return await res.json();
}

/**
 * @param {string} initData  HMAC-подпись от Telegram.WebApp.initData
 * @param {number} tableId
 * @param {number} deposit  сумма бай-ина
 */
export async function joinTable(initData, tableId, deposit) {
  const res = await fetch(`${BASE}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, table_id: tableId, deposit })
  });
  if (!res.ok) {
    throw new Error(`joinTable error ${res.status}`);
  }
  return await res.json();
}

export async function getBalance(tableId, userId) {
  const res = await fetch(`${BASE}/api/balance?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`getBalance error ${res.status}`);
  return await res.json();
}

export async function getGameState(tableId) {
  const res = await fetch(`${BASE}/api/game_state?table_id=${tableId}`);
  if (!res.ok) throw new Error(`getGameState error ${res.status}`);
  return await res.json();
}

export default {
  listTables, createTable, joinTable, getBalance, getGameState
};
