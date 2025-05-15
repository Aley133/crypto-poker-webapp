// js/api.js

const BASE = '';

export async function listTables(level) {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`);
  return res.json();
}

export async function createTable(level) {
  const res = await fetch(`${BASE}/api/tables?level=${level}`, {
    method: 'POST'
  });
  return res.json();
}

export async function joinTable(tableId, userId) {
  const res = await fetch(`${BASE}/api/join?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`, {
    method: 'POST'
  });
  return res.json();
}

export async function getBalance(tableId, userId) {
  const res = await fetch(`${BASE}/api/balance?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`);
  return res.json();
}

export async function getGameState(tableId) {
  const res = await fetch(`${BASE}/api/game_state?table_id=${tableId}`);
  return res.json();
}
