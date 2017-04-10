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
      var channels = Object.keys(vm.channels.subs);
      var i = channels.length - 1;
      for (; i > -1; i--) {
        var channel = channels[i];
        if (open === 1) {
          var filters = getChannelFilters(channel);
          joinChannel(channel, filters);
          vm.channels.subs[channel].initialized = true;
        } else if (open === true) {
          vm.channels.subs[channel].initialized = true;
        } else if (open === false) {
          vm.channels.subs[channel].initialized = false;
        }
      }
    }

    function subscribe(channel, responseHandle) {
      var channelSub = initChannel(channel);
      return channelSub.observable.subscribe(responseHandle);
    }

    function initChannel(channel) {
      var channels = init();
      var channelSub = channels.subs[channel];
      if (!channelSub) {
        channelSub = channels.subs[channel] = {
          name: channel,
          filters: [],
          initialized: false
        };
        channelSub.observable = createNewChannelObservable(channel, channelSub);
      }
      return channelSub;
    }

    function createNewChannelObservable(channel, channelSub) {
      return new Rx.Observable.create(function (observer) {
        var filters = getChannelFilters(channel);
        channelSub.initialized = true;
        joinChannel(channel, filters);
        var channelsSubscription = vm.channels.observable.filter(createChannelFilter(channel)).subscribe(observer);
        return function () {
          leaveChannel(channel);
          channelsSubscription.unsubscribe();
          channelSub.initialized = false;
          delete vm.channels.subs[channel];
        };
      }).share();
    }

    function subscribeFilter(channel, filter, responseHandle) {
      return initFilter(channel, filter).observable.subscribe(responseHandle);
    }

    function initFilter(channel, filter) {
      var channelSub = initChannel(channel);
      var filterSub = findExistingFilter(channelSub.filters, filter);
      if (!filterSub) {
        filterSub = {
          observable: createNewFilterObservable(channelSub, filter),
          filter: filter
        }
      }
      return filterSub;
    }

    function findExistingFilter(channelFilters, filter) {
      var i = 0, l = channelFilters.length;
      for (; i < l; i++) {
        if (matchFilters(channelFilters[i].filter, filter)) {
          return channelFilters[i];
        }
      }
    }

    function matchFilters(source, target) {
      if (target) {
        for (var p in source) {
          if (source[p] !== target[p]) {
            return false;
          }
        }
      }
    }

    function createNewFilterObservable(channelSub, filter) {
      return new Rx.Observable.create(function (observer) {
        channelSub.filters.push(filter);
        if (channelSub.initialized) {
          changeChannelFilters(channelSub.name, vm.connection.options.filterJoinAction, filter);
        }
        var filterSubscription = channelSub.observable.filter(createFilterFunction(filter)).subscribe(observer);
        return function () {
          channelSub.filters.splice(channelSub.filters.indexOf(filter), 1);
          if (channelSub.initialized) {
            changeChannelFilters(channelSub.name, vm.connection.options.filterLeaveAction, filter);
          }
          filterSubscription.unsubscribe();
        };
      }).share();
    }

    function getChannelFilters(channel) {
      return vm.channels.subs[channel]
        .filters
        .map(function (filter) {
          return {
            action: vm.connection.options.filterJoinAction,
            filter: filter
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

    function leaveChannel(channel) {
      vm.connection.subject.next({
        action: vm.connection.options.channelLeaveAction,
        channel: channel
      });
    }

    function changeChannelFilters(channel, actionType, filter) {
      vm.connection.subject.next({
        action: vm.connection.options.channelJoinAction,
        channel: channel,
        filters: [{
          action: actionType,
          filter: filter
        }]
      });
    }

    function createChannelFilter(channel) {
      return function (data) {
        return data.channel === channel;
      };
    }

    function createFilterFunction(filter) {
      return function (data) {
        return matchFilters(filter, data.filter);
      };
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
      filterLeaveAction: userOptions.filterLeaveAction || defaultOptions.filterLeaveAction
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
            socket.send(JSON.stringify(data));
          });
        };
        socket.onmessage = function (message) {
          observer.next(JSON.parse(message.data));
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
