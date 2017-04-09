(function () {
  'use strict';

  var socket = rxSocket.create({url: 'localhost:3000/api'});
  console.log(socket);
  socket.channels.subscribe('one', function (message) {
    console.log(message);
  });

  socket.channels.subscribe('one', function (message) {
    console.log('secondSubscription to one');
    console.log(message);
  });

  socket.channels.subscribe('two', function (message) {
    console.log(message);
  });
})();
