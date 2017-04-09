(function () {
  'use strict';
  rxSocket.channels = channels;

  function channels(connection) {

    var vm = this;
    this.connection = connection;

    vm.channelSubscriptions = {};

    function init() {
      if (!vm.channelsObservable) {
        vm.channelsObservable = new Rx.Observable.create(function (observer) {
          var webSocketSubscription = vm.connection.observable.subscribe(observer);
          return function () {
            webSocketSubscription.unsubscribe();
          };
        }).share();
        vm.connection.connectionStatus.subscribe(reSubscribe);
      }
    }

    function initChannel(channel) {
      init();
      var channelSub = vm.channelSubscriptions[channel];
      if (!channelSub) {
        vm.channelSubscriptions[channel] = {
          observable: createNewChannelObservable(channel),
          filters: []
        };
      }
    }

    function reSubscribe(open) {
      if (open === 1) {
        var channels = Object.keys(vm.channelSubscriptions);
        var i = channels.length - 1;
        for (; i > -1; i--) {
          // var filters = getChannelFilters(channels[i]);
          joinChannel(channels[i]);
        }
      }
    }

    function subscribe(channel, responseHandle) {
      initChannel(channel);
      var channelSub = vm.channelSubscriptions[channel];

      return channelSub.observable.subscribe(responseHandle);
    }

    function addFilterSubscription(channel, filter, responseHandle) {
      return new Rx.Observable.create(function (observer) {
        initChannel(channel);
        var channel = vm.channelSubscriptions[channel];
        if (!_.find(channel.filters, filter)) {
          changeChannelFilters(channel, vm.connection.options.filterJoinAction, filter);
        }
        channel.filters.push(filter);
        var filterSubscription = channel.observable.filter(createFilterFunction(filter)).subscribe(observer);
        return function () {
          _.remove(channel.filters, filter);
          if (!_.findBy(channel.filters, filter)) {
            changeChannelFilters(channel, vm.connection.options.filterLeaveAction, filter);
          }
          filterSubscription.unsubscribe();
        };
      }).share().subscribe(responseHandle);
    }

    function createNewChannelObservable(channel) {
      return new Rx.Observable.create(function (observer) {
        // var filters = getChannelFilters(channel);
        joinChannel(channel);
        var channelsSubscription = vm.channelsObservable.filter(createChannelFilter(channel)).subscribe(observer);
        return function () {
          leaveChannel(channel);
          channelsSubscription.unsubscribe();
          delete vm.channelSubscriptions[channel];
        };
      }).share();
    }

    function getChannelFilters(channel) {
      _.uniqWith(vm.channelSubscriptions[channel].filters, _.isEqual)
        .map(function (filter) {
          return {
            action: vm.connection.options.filterJoinAction,
            type: channel
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
          type: channel
        }]
      });
    }

    function createChannelFilter(channel) {
      return function (data) {
        return data.channel === channel;
      };
    }

    function createFilterFunction(filters) {
      return function (data) {
        console.log('filter filters', data, filters);
        return true;
      };
    }

    return {
      subscribe: subscribe,
      addFilterSubscription: addFilterSubscription
    };
  }
})();
