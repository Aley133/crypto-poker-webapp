// webapp/js/ws.js
export class GameSocket {
  constructor(tableId, userId, onMessage) {
    this.userId = userId;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws/game/${tableId}`);
    this.ws.onmessage = e => onMessage(JSON.parse(e.data));
    this.ws.onclose = () => setTimeout(() => this.reconnect(onMessage), 3000);
  }
  reconnect(onMessage) {
    new GameSocket(this.tableId, this.userId, onMessage);
  }
  send(action, amount=0) {
    if (this.ws.readyState===WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ user_id:this.userId, action, amount }));
    }
  }
}
