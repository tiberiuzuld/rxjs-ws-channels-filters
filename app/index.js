(function () {
  'use strict';

  var options = {
    url: 'localhost:3000/api',
    invalidUrl: function (e) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          options.url = 'localhost:3000/api';
          resolve(10);
        }, 1000);
      });
    }
  };

  var socket = rxSocket.create(options);
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

  var filterSub = socket.channels.subscribeFilter('three', {id: 3}, function (message) {
    console.log('filter', message);
  });

  setTimeout(function () {
    filterSub.unsubscribe();
    var filterSub2 = socket.channels.subscribeFilter('three', {id: 4}, function (message) {
      console.log('filter', message);
    });
  }, 5000);
})();
