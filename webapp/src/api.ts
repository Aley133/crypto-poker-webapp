const BASE = '';

export interface Table {
  id: string;
  small_blind?: number;
  big_blind?: number;
  buy_in?: number;
  players?: number;
  [key: string]: any;
}

export async function listTables(level: string): Promise<{ tables: Table[] }> {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`);
  if (!res.ok) throw new Error(`listTables error ${res.status}`);
  return res.json();
}

export async function createTable(level: string): Promise<Table> {
  const res = await fetch(`${BASE}/api/tables?level=${encodeURIComponent(level)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`createTable error ${res.status}`);
  return res.json();
}

export async function joinTable(tableId: string, userId: string): Promise<any> {
  const res = await fetch(`${BASE}/api/join?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`joinTable error ${res.status}`);
  return res.json();
}

export async function getBalance(tableId: string, userId: string): Promise<any> {
  const res = await fetch(`${BASE}/api/balance?table_id=${tableId}&user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`getBalance error ${res.status}`);
  return res.json();
}

export async function getGameState(tableId: string): Promise<any> {
  const res = await fetch(`${BASE}/api/game_state?table_id=${tableId}`);
  if (!res.ok) throw new Error(`getGameState error ${res.status}`);
  return res.json();
}

export default {
  listTables, createTable, joinTable, getBalance, getGameState
};
