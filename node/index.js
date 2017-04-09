var WebSocketServer = require('uws').Server;
var wss = new WebSocketServer({port: 3001}, function () {
  console.log('Service listening on 3001');
});


wss.on('connection', function (ws) {
  ws.on('message', function onMessage(message) {
    console.log('received: ' + message);
    var m = JSON.parse(message);
    ws.send(JSON.stringify({
      channel: m.channel,
      data: {
        value: 3
      }
    }));
  });
});
