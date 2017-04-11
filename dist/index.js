'use strict';
var rxSocket = {};

(function () {
  'use strict';
  rxSocket.QueueSubject = QueueSubject;

  QueueSubject.prototype = Object.create(Rx.Subject.prototype);

  function QueueSubject() {
    Rx.Subject.apply(this, arguments);
    this._queuedValues = [];
    return this;
  }

  QueueSubject.prototype.next = function (value) {
    if (this.closed || this.observers.length)
      Rx.Subject.prototype.next.call(this, value);
    else
      this._queuedValues.push(value);
  };

  QueueSubject.prototype._subscribe = function (subscriber) {
    var vm = this;
    var ret = Rx.Subject.prototype._subscribe.call(this, subscriber);
    if (this._queuedValues.length) {
      this._queuedValues.forEach(function (value) {
        return Rx.Subject.prototype.next.call(vm, value);
      });
      this._queuedValues.splice(0);
    }
    return ret;
  };
})();

(function () {
  'use strict';
  rxSocket.channels = channels;

  function channels(connection) {

    var vm = this;
    this.connection = connection;

    vm.channels = {
      observable: undefined,
      subs: {}
    };

    vm.channelsMatch = vm.connection.options.channelsMatch || channelsMatch;
    vm.filtersMatch = vm.connection.options.filtersMatch || filtersMatch;

    function init() {
      if (!vm.channels.observable) {
        vm.channels.observable = new Rx.Observable.create(function (observer) {
          var webSocketSubscription = vm.connection.observable.subscribe(observer);
          return function () {
            webSocketSubscription.unsubscribe();
          };
        }).share();
        vm.connection.connectionStatus.subscribe(reSubscribe);
      }
      return vm.channels;
    }

    function reSubscribe(open) {
      if (open === 1) {
        var channels = Object.keys(vm.channels.subs);
        var i = channels.length - 1;
        for (; i > -1; i--) {
          var channel = channels[i];
          var filters = getChannelFilters(channel);
          joinChannel(channel, filters);
        }
      }
    }

    function subscribe(channel, responseHandle) {
      var channelSub = initChannel(channel);
      var subscriber = channelSub.observable.subscribe(responseHandle);
      subscriber.send = createChannelSenderFunction(channel);
      return subscriber;
    }

    function initChannel(channel) {
      var channels = init();
      var channelSub = channels.subs[channel];
      if (!channelSub) {
        channelSub = channels.subs[channel] = {
          name: channel,
          filters: [],
          filtersToSend: []
        };
        channelSub.observable = createNewChannelObservable(channel, channelSub);
        channelSub.serverNotification = createNewChannelServerSubscriptionObservable(channelSub);
      }
      return channelSub;
    }

    function createNewChannelServerSubscriptionObservable(channelSub) {
      return new Rx.Observable.create(function (observer) {
        channelSub.observer = observer;
      }).debounceTime(10).subscribe(debounceChannelNotifications);
    }

    function createNewChannelObservable(channel, channelSub) {
      return new Rx.Observable.create(function (observer) {
        joinChannel(channel);
        var channelsSubscription = vm.channels.observable.filter(createChannelFilter(channel)).subscribe(observer);
        return function () {
          leaveChannel(channel);
          channelsSubscription.unsubscribe();
          channelSub.serverNotification.unsubscribe();
          delete vm.channels.subs[channel];
        };
      }).publishReplay(1).refCount();
    }

    function channelsMatch(source, target) {
      return source === target;
    }

    function subscribeFilter(channel, filter, responseHandle) {
      var subscriber = initFilter(channel, filter).observable.subscribe(responseHandle);
      subscriber.send = createChannelSenderFunction(channel, filter);
      return subscriber;
    }

    function initFilter(channel, filter) {
      var channelSub = initChannel(channel);
      var filterSub = findExistingFilter(channelSub.filters, filter);
      if (!filterSub) {
        filterSub = {
          filter: filter
        };
        filterSub.observable = createNewFilterObservable(channelSub, filter, filterSub);
        channelSub.filters.push(filterSub);
      }
      return filterSub;
    }

    function findExistingFilter(channelFilters, filter) {
      var i = 0, l = channelFilters.length;
      for (; i < l; i++) {
        if (vm.filtersMatch(channelFilters[i].filter, filter)) {
          return channelFilters[i];
        }
      }
    }

    function filtersMatch(source, target) {
      if (target) {
        for (var p in source) {
          if (source[p] !== target[p]) {
            return false;
          }
        }
        return true;
      }
    }

    function createNewFilterObservable(channelSub, filter, filterSub) {
      return new Rx.Observable.create(function (observer) {
        channelSub.observer.next(channelSub.name);
        channelSub.filtersToSend.push({
          action: vm.connection.options.filterJoinAction,
          filter: filter
        });
        var filterSubscription = channelSub.observable.filter(createFilterFunction(filter)).subscribe(observer);
        return function () {
          channelSub.filters.splice(channelSub.filters.indexOf(filterSub), 1);
          channelSub.observer.next(channelSub.name);
          channelSub.filtersToSend.push({
            action: vm.connection.options.filterLeaveAction,
            filter: filter
          });
          filterSubscription.unsubscribe();
        };
      }).publishReplay(1).refCount();
    }

    function getChannelFilters(channel) {
      return vm.channels.subs[channel]
        .filters
        .map(function (filterSub) {
          return {
            action: vm.connection.options.filterJoinAction,
            filter: filterSub.filter
          };
        });
    }

    function joinChannel(channel, filters) {
      vm.connection.subject.next({
        action: vm.connection.options.channelJoinAction,
        channel: channel,
        filters: filters
      });
    }

    function debounceChannelNotifications(channel) {
      var filtersToSend = [];
      var filters = vm.channels.subs[channel].filtersToSend;
      var i = 0, l = filters.length;
      for (; i < l; i++) {
        var filterToSend = filters[i];
        var existingFilter = findExistingFilter(filtersToSend, filterToSend.filter);
        if (existingFilter) {
          filtersToSend.splice(filtersToSend.indexOf(existingFilter), 1);
        } else {
          filtersToSend.push({
            action: filterToSend.action,
            filter: filterToSend.filter
          });
        }
      }

      vm.channels.subs[channel].filtersToSend = [];
      if (filtersToSend.length) {
        joinChannel(channel, filtersToSend);
      }
    }

    function leaveChannel(channel) {
      vm.connection.subject.next({
        action: vm.connection.options.channelLeaveAction,
        channel: channel
      });
    }

    function createChannelFilter(channel) {
      return function (data) {
        return vm.channelsMatch(channel, data.channel);
      };
    }

    function createFilterFunction(filter) {
      return function (data) {
        return vm.filtersMatch(filter, data.filter);
      };
    }

    function createChannelSenderFunction(channel, filter) {
      return function (message) {
        vm.connection.subject.next({
          action: vm.connection.options.notifyAction,
          channel: channel,
          filter: filter,
          data: message
        });
      }
    }

    return {
      subscribe: subscribe,
      subscribeFilter: subscribeFilter
    };
  }
})();

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
          observer.next(message);
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
        return errors.delay(Math.min(vm.retries++ * 8, 60) * 1000);
      }).share();
    }

    vm.connectionStatus = new Rx.BehaviorSubject(false);
    vm.subject = new rxSocket.QueueSubject();
    vm.channels = new rxSocket.channels(this);
    vm.observable = connect();

    return vm;
  }

})();
