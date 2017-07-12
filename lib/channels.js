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
        vm.channels.observable = vm.connection.observable;
        vm.connection.connectionStatus.subscribe(reSubscribe);
      }
      return vm.channels;
    }

    function reSubscribe(open) {
      if (open === vm.connection.connectionStatusOptions.openedAfterRetry) {
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
      }).publishReplay().refCount();
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
      }).publishReplay().refCount();
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
