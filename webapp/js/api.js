// api.js

export async function joinTable(tableId, userId, username) {
  return fetch(`/api/join?table_id=${tableId}&user_id=${userId}&username=${username}`, {
    method: 'POST'
  });
}

export async function leaveTable(tableId, userId) {
  return fetch(`/api/leave?table_id=${tableId}&user_id=${userId}`, {
    method: 'POST'
  });
}

export async function startHand(tableId) {
  return fetch(`/api/start_hand?table_id=${tableId}`, {
    method: 'POST'
  });
}
