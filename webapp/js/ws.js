// js/ws.js

// Получаем table_id из query string, например ?table_id=1
function getTableId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('table_id');
}

const tableId = getTableId();
if (!tableId) {
  console.error('Table ID is missing in URL');
} else {
  // При подключении к WebSocket ожидаем числовой ID
  const ws = new WebSocket(`wss://${window.location.host}/ws/game/${tableId}`);

  ws.onopen = () => {
    console.log('WebSocket connected to table', tableId);
  };

  ws.onmessage = (evt) => {
    const state = JSON.parse(evt.data);
    // Здесь обновляете UI на странице игры
    renderGameState(state);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
  };

  ws.onerror = (err) => {
    console.error('WebSocket error', err);
  };

  // Экспортируем ws, если нужно в других модулях
  window.gameSocket = ws;
}
