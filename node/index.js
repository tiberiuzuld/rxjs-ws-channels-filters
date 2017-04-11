var WebSocketServer = require('uws').Server;
var wss = new WebSocketServer({port: 3001}, function () {
  console.log('Service listening on 3001');
});


wss.on('connection', function (ws) {
  ws.on('message', function onMessage(message) {
    console.log('received: ' + message);
    var m = JSON.parse(message);
    if (m.action === 'NOTIFY') {
      ws.send(JSON.stringify({
        channel: m.channel,
        filter: m.filter,
        data: m.data
      }));
    } else {
      ws.send(JSON.stringify({
        channel: m.channel,
        filter: m.filters && m.filters[0] ? m.filters[0].filter : undefined,
        data: {
          value: 3
        }
      }));
    }
  });
});
