export class GameSocket {
  constructor(tableId, userId, onState) {
    this.userId = userId;
    const proto = location.protocol==='https:'?'wss':'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws/game/${tableId}`);
    this.ws.onmessage = e => onState(JSON.parse(e.data));
    this.ws.onclose   = ()=>setTimeout(()=>this.reconnect(onState),3000);
  }
  reconnect(onState) { new GameSocket(this.tableId,this.userId,onState); }
  send(act,amt=0) {
    if (this.ws.readyState===WebSocket.OPEN)
      this.ws.send(JSON.stringify({user_id:this.userId,action:act,amount:amt}));
  }
}
