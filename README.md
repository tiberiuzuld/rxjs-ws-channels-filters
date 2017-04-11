# rxjs-ws-channels-filters
RxJS implementation of websockets with channels and filters

#### Work in progress

```javascript

   var options = {
    url: 'localhost:3000/api',
    invalidUrl: function (e) {
      // optional option if close event code is >= 1006 https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
      // this function will be called expecting a promise
      // in the resolve of the promise the websocket connection will try again to connect with the url from the options
      // in the reject of the promise the websocket observer will complete
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          options.url = 'localhost:3000/api';
          resolve(10);
        }, 1000);
      });
    },
    transformResponse: function (message) {
      // transform the response from server
      return message;
    },
    transformRequest: function (message) {
      // transform the request sent to server
      if (message.filters && message.filters.length) {
        var i = message.filters.length - 1;
        for (; i > -1; i--) {
          message.filters[i].type = message.channel;
        }
      }
      return message;
    },
    channelsMatch: function channelsMatch(source, target) {
      // default function to find matching channels used for sending messages to the correct channel
      // and to not have duplicate channels
      // optional option, arguments ['existing channel', 'message channel']
      return source === target;
    },
    filtersMatch: function filtersMatch(source, target) {
      // default function to find matching filters used for sending messages to the correct filter
      // and to not have duplicate filters on the same channel
      // optional option, arguments ['existing filter object', 'message filter object']
      if (target) {
        for (var p in source) {
          if (source[p] !== target[p]) {
            return false;
          }
        }
        return true;
      }
    },
    // default options for actions
    channelJoinAction: 'JOIN',
    channelLeaveAction: 'LEAVE',
    filterJoinAction: 'ADD',
    filterLeaveAction: 'REMOVE',
    notifyAction: 'NOTIFY'
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
  
  filterSub.send('this is a message, from filter'); //send messages to server on this channel and filter

  setTimeout(function () {
    filterSub.unsubscribe();
    var filterSub2 = socket.channels.subscribeFilter('three', {id: 4}, function (message) {
      console.log('filter', message);
    });
  }, 5000);

```

### TODO
 * make a separate repo with a server side node implementation
 * make better documentation
 * make demo
 
