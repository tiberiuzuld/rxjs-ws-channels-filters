(function () {
  'use strict';
  rxSocket.Create = Create;
  var defaultOptions = {
    channelJoinAction: 'JOIN',
    channelLeaveAction: 'LEAVE',
    filterJoinAction: 'ADD',
    filterLeaveAction: 'REMOVE',
    notifyAction: 'NOTIFY'
  };

  var connectionStatusOptions = {
    closed: 'Closed',
    open: 'Open',
    connectionRetry: 'ConnectionRetry',
    openedAfterRetry: 'openedAfterRetry'
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

  function Create(userOptions, rxObservable, rxSubject, rxBehaviorSubject, rxTimer, rxRetryWhen, rxShare,
                  rxPublishReplay, rxRefCount, rxDebounceTime, rxFilter, rxFlatMap) {
    rxSocket.Rx = {
      Observable: rxObservable || rxjs.Observable,
      Subject: rxSubject || rxjs.Subject,
      BehaviorSubject: rxBehaviorSubject || rxjs.BehaviorSubject,
      timer: rxTimer || rxjs.timer,
      retryWhen: rxRetryWhen || rxjs.operators.retryWhen,
      share: rxShare || rxjs.operators.share,
      publishReplay: rxPublishReplay || rxjs.operators.publishReplay,
      refCount: rxRefCount || rxjs.operators.refCount,
      debounceTime: rxDebounceTime || rxjs.operators.debounceTime,
      filter: rxFilter || rxjs.operators.filter,
      flatMap: rxFlatMap || rxjs.operators.flatMap
    };
    rxSocket.QueueSubjectInit();
    if (!userOptions.url) {
      console.error('WebSocket url not provided!');
      return;
    }

    this.options = addDefaultOptions(userOptions);

    var vm = this;
    vm.retries = false;
    vm.openedOnce = false;

    vm.connectionStatus = new rxSocket.Rx.BehaviorSubject(false);
    vm.subject = new rxSocket.QueueSubject();
    vm.channels = new rxSocket.Channels(vm);
    vm.connectionStatusOptions = connectionStatusOptions;
    vm.observable = connect(vm, userOptions);

    return vm;
  }

  function connect(vm, userOptions) {
    return new rxSocket.Rx.Observable.create(socketObservable)
      .pipe(
        rxSocket.Rx.retryWhen(function (errors) {
          return errors.pipe(rxSocket.Rx.flatMap(function () {
            vm.retries = true;
            vm.connectionStatus.next(connectionStatusOptions.connectionRetry);
            return rxSocket.Rx.timer(5 * 1000);
          }));
        }),
        rxSocket.Rx.share(),
        rxSocket.Rx.publishReplay(1000),
        rxSocket.Rx.refCount()
      );

    function socketObservable(observer) {
      var wsUri = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + vm.options.url;
      var socket = new WebSocket(wsUri);
      var inputSubscription;
      socket.onopen = function () {
        vm.connectionStatus.next(
          vm.openedOnce && vm.retries ? connectionStatusOptions.openedAfterRetry : connectionStatusOptions.open);
        vm.retries = false;
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
        vm.connectionStatus.next(connectionStatusOptions.closed);
        if (event.code < 1006) {
          observer.complete();
        } else if (vm.options.invalidUrl) {
          // Invalid Url
          var promise = vm.options.invalidUrl(event);
          promise.then(function () {
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
        setTimeout(function () {
          if (inputSubscription) {
            inputSubscription.unsubscribe();
          }
          socket.close();
        });
      };
    }
  }

})();
