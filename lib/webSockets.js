(function () {
  'use strict';
  rxSocket.create = create;
  var defaultOptions = {
    channelJoinAction: 'JOIN',
    channelLeaveAction: 'LEAVE',
    filterJoinAction: 'ADD',
    filterLeaveAction: 'REMOVE'
  };

  var CHANGE_TYPES = {
    CREATED: 1,
    MODIFIED: 2,
    DELETED: 3
  };

  function addDefaultOptions(userOptions) {
    return {
      url: userOptions.url,
      invalidUrl: userOptions.invalidUrl,
      channelJoinAction: userOptions.channelJoinAction || defaultOptions.channelJoinAction,
      channelLeaveAction: userOptions.channelLeaveAction || defaultOptions.channelLeaveAction,
      filterJoinAction: userOptions.filterJoinAction || defaultOptions.filterJoinAction,
      filterLeaveACtion: userOptions.filterLeaveAction || defaultOptions.filterLeaveAction
    }
  }

  function create(userOptions) {
    if (!userOptions.url) {
      console.error('WebSocket url not provided!');
      return;
    }

    this.options = addDefaultOptions(userOptions);

    var vm = this;
    vm.retries = 0;
    function connect() {
      return new Rx.Observable.create(function (observer) {
        var wsUri = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + vm.options.url;
        var socket = new WebSocket(wsUri);
        var inputSubscription;
        socket.onopen = function () {
          vm.connectionStatus.next(vm.retries ? 1 : true); // 1 indicates to channels to resubscribe to server
          vm.retries = 0;
          inputSubscription = vm.subject.subscribe(function (data) {
            socket.send(JSON.stringify(data));
          });
        };
        socket.onmessage = function (message) {
          observer.next(JSON.parse(message.data));
        };
        socket.onerror = function (error) {
          vm.connectionStatus.next(false);
          observer.error(error);
        };
        socket.onclose = function (event) {
          vm.connectionStatus.next(false);
          if (event.code < 1006) {
            observer.complete();
          } else if (vm.options.invalidUrl) {
            // Invalid Url
            vm.options.invalidUrl(event).then(function () {
              observer.error(new Error(event.code));
            }, function () {
              observer.error(new Error(event.code));
            });
          } else {
            observer.error(new Error(event.code));
          }
        };
        return function () {
          if (inputSubscription) {
            inputSubscription.unsubscribe();
          }
          vm.connectionStatus.next(false);
          socket.close();
        };
      }).retryWhen(function (errors) {
        vm.retries++;
        return errors.delay(Math.min(vm.retries * 8, 60) * 1000);
      }).share();
    }

    vm.connectionStatus = new Rx.BehaviorSubject(false);
    vm.subject = new rxSocket.QueueSubject();
    vm.channels = new rxSocket.channels(this);
    vm.observable = connect();

    return vm;
  }

})();
