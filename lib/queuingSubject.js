(function () {
  'use strict';
  rxSocket.QueueSubjectInit = function () {
    rxSocket.QueueSubject = QueueSubject;

    QueueSubject.prototype = Object.create(rxSocket.Rx.Subject.prototype);

    function QueueSubject() {
      rxSocket.Rx.Subject.apply(this, arguments);
      this._queuedValues = [];
      return this;
    }

    QueueSubject.prototype.next = function (value) {
      if (this.closed || this.observers.length) {
        rxSocket.Rx.Subject.prototype.next.call(this, value);
      } else {
        this._queuedValues.push(value);
      }
    };

    QueueSubject.prototype._subscribe = function (subscriber) {
      var vm = this;
      var ret = rxSocket.Rx.Subject.prototype._subscribe.call(this, subscriber);
      if (this._queuedValues.length) {
        this._queuedValues.forEach(function (value) {
          return rxSocket.Rx.Subject.prototype.next.call(vm, value);
        });
        this._queuedValues.splice(0);
      }
      return ret;
    };
  };
})();
