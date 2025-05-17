// ws.js

let pollingInterval = null;

export function connectWS(tableId, userId, onState, onError) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/ws/${tableId}/${userId}`);

  socket.onmessage = (e) => onState(JSON.parse(e.data));
  socket.onerror = () => {
    socket.close();
    if (onError) onError();
  };
  socket.onclose = () => {
    if (pollingInterval === null && onError) onError();
  };

  return socket;
}

export function startPolling(tableId, userId, onState) {
  // fallback: опрашиваем раз в 2 сек
  pollingInterval = setInterval(async () => {
    const resp = await fetch(`/api/state?table_id=${tableId}&user_id=${userId}`);
    if (resp.ok) {
      const data = await resp.json();
      onState(data);
    }
  }, 2000);
}

export function stopPolling() {
  if (pollingInterval !== null) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
