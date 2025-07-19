// webapp/js/api.js
const BASE = '';

export async function listTables(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`, {
    headers: { 'Authorization': window.initData || '' }
  });
  if (!res.ok) throw new Error(`listTables error ${res.status}`);
  return await res.json();
}

export async function createTable(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`, {
    method: 'POST',
    headers: { 'Authorization': window.initData || '' }
  });
  if (!res.ok) throw new Error(`createTable error ${res.status}`);
  return await res.json();
}

export async function joinTable(tableId, userId, seat, deposit) {
  const res = await fetch(`${BASE}/api/join?table_id=${tableId}&user_id=${encodeURIComponent(userId)}&seat=${seat}&deposit=${deposit}`, {
    method: 'POST',
    headers: { 'Authorization': window.initData || '' }
  });
  if (!res.ok) throw new Error(`joinTable error ${res.status}`);
  return await res.json();
}

export async function getBalance(tableId, userId) {
  const res = await fetch(`${BASE}/api/balance?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`, {
    headers: { 'Authorization': window.initData || '' }
  });
  if (!res.ok) throw new Error(`getBalance error ${res.status}`);
  return await res.json();
}

export async function getGameState(tableId) {
  const res = await fetch(`${BASE}/api/game_state?table_id=${tableId}`, {
    headers: { 'Authorization': window.initData || '' }
  });
  if (!res.ok) throw new Error(`getGameState error ${res.status}`);
  return await res.json();
}

export default {
  listTables, createTable, joinTable, getBalance, getGameState
};
