(function () {
  'use strict';
  rxSocket.create = create;
  var defaultOptions = {
    channelJoinAction: 'JOIN',
    channelLeaveAction: 'LEAVE',
    filterJoinAction: 'ADD',
    filterLeaveAction: 'REMOVE',
    notifyAction: 'NOTIFY'
  };

  function addDefaultOptions(userOptions) {
    return {
      url: userOptions.url,
      invalidUrl: userOptions.invalidUrl,
      channelsMatch: userOptions.channelsMatch,
      filtersMatch: userOptions.filtersMatch,
      transformResponse: userOptions.transformResponse,
      handleResponseMessage: userOptions.handleResponseMessage,
      transformRequest: userOptions.transformRequest,
      channelJoinAction: userOptions.channelJoinAction || defaultOptions.channelJoinAction,
      channelLeaveAction: userOptions.channelLeaveAction || defaultOptions.channelLeaveAction,
      filterJoinAction: userOptions.filterJoinAction || defaultOptions.filterJoinAction,
      filterLeaveAction: userOptions.filterLeaveAction || defaultOptions.filterLeaveAction,
      notifyAction: userOptions.notifyAction || defaultOptions.notifyAction
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
    vm.openedOnce = false;
    function connect() {
      return new Rx.Observable.create(function (observer) {
        var wsUri = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + vm.options.url;
        var socket = new WebSocket(wsUri);
        var inputSubscription;
        socket.onopen = function () {
          vm.connectionStatus.next(vm.openedOnce && vm.retries ? 1 : true); // 1 indicates to channels to resubscribe
          // to server
          vm.retries = 0;
          vm.openedOnce = true;
          inputSubscription = vm.subject.subscribe(function (data) {
            var message = data;
            if (vm.options.transformRequest) {
              message = vm.options.transformRequest(JSON.parse(JSON.stringify(message)));
            }
            socket.send(JSON.stringify(message));
          });
        };
        socket.onmessage = function (response) {
          var message = JSON.parse(response.data);
          if (vm.options.transformResponse) {
            message = vm.options.transformResponse(message);
          }
          if (vm.options.handleResponseMessage) {
            vm.options.handleResponseMessage(message, observer);
          } else {
            observer.next(message);
          }
        };
        socket.onerror = function (error) {
          console.error(error);
        };
        socket.onclose = function (event) {
          vm.connectionStatus.next(false);
          if (event.code < 1006) {
            observer.complete();
          } else if (vm.options.invalidUrl) {
            // Invalid Url
            vm.options.invalidUrl(event).then(function () {
              vm.options = addDefaultOptions(userOptions);
              observer.error(new Error(event.code));
            }, function () {
              observer.complete(event.code);
            }).catch(console.error);
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
        return Rx.Observable
                 .range(0, 100000)
                 .zip(errors, function (i) {
                   return i;
                 }).flatMap(function (i) {
            return Rx.Observable.timer(Math.min(i * 8, 60) * 1000);
          });
      }).share();
    }

    vm.connectionStatus = new Rx.BehaviorSubject(false);
    vm.subject = new rxSocket.QueueSubject();
    vm.channels = new rxSocket.channels(this);
    vm.observable = connect();

    return vm;
  }

})();
