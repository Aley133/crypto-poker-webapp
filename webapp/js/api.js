// webapp/js/api.js
const BASE = '';

export async function listTables(level) {
  const url = `${BASE}/api/tables?level=${encodeURIComponent(level)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: window.initData,
    }
  });
  if (!res.ok) throw new Error(`listTables error ${res.status}`);
  return await res.json();
}

export async function createTable(level) {
  const url = `${BASE}/api/tables?level=${encodeURIComponent(level)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: window.initData,
    }
  });
  if (!res.ok) throw new Error(`createTable error ${res.status}`);
  return await res.json();
}

export async function joinTable(tableId, userId, seat, deposit) {
  const url = `${BASE}/api/join?table_id=${tableId}&user_id=${encodeURIComponent(userId)}&seat=${seat}&deposit=${deposit}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: window.initData,
    }
  });
  if (!res.ok) throw new Error(`joinTable error ${res.status}`);
  return await res.json();
}

export async function getBalance(userId) {
  const url = `${BASE}/api/balance?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: window.initData,
    }
  });
  if (!res.ok) throw new Error(`getBalance error ${res.status}`);
  return await res.json();
}

export async function getGameState(tableId) {
  const url = `${BASE}/api/game_state?table_id=${tableId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: window.initData,
    }
  });
  if (!res.ok) throw new Error(`getGameState error ${res.status}`);
  return await res.json();
}

export default {
  listTables, createTable, joinTable, getBalance, getGameState
};
