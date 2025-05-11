// js/ws.js
export class GameSocket {
  constructor(tableId, onState) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws/game/${tableId}`);
    this.ws.onmessage = e => {
      try { onState(JSON.parse(e.data)); }
      catch (err) { console.error('Invalid WS JSON', err); }
    };
    this.ws.onclose = () => setTimeout(() => this.reconnect(onState), 3000);
  }

  reconnect(onState) {
    console.log('Reconnecting WS…');
    this.constructor(this.tableId, onState);
  }

  send(action, amount = 0) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ user_id: this.userId, action, amount }));
    }
  }
}
