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
