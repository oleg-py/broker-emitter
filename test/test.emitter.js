'use strict';
/**
 * Test emitter
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var Promise = require('bluebird');
var Emitter = require('./../lib/emitter');

describe('Emitter', function () {
  describe('#on(event, listener)', function () {
    this.timeout(20 * 1000);
    before(function () {
      var emitter = new Emitter({
        uri: this.uri,
        exchangeName: 'broker-emitter-test'
      });
      this.emitter = emitter;
      return emitter.connect();
    });
    it('receive message', function () {
      var self = this;
      var receivedMessage = [];
      var event = 'broker-test.on';
      var resolver;
      var expectation = new Promise(function (resolve, reject) {
        resolver = resolve;
      });
      this.emitter.on(event, function (message) {
        receivedMessage.push(message);
        if (receivedMessage.length === 2) {
          resolver();
        }
      });

      return Promise.resolve().delay(1000)
        .then(function () {
          return self.emitter.emit(event, 'message-1');
        })
        .then(function () {
          return self.emitter.emit(event, 'message-2');
        })
        .then(function () {
          return expectation;
        });
    });
    it('able to attaches multiple listener', function () {
      var self = this;
      var receivedMessage = [];
      var receivedMessage2 = [];
      var event = 'broker-test.on';
      var resolver;
      var resolver2;
      var expectation = new Promise(function (resolve, reject) {
        resolver = resolve;
      });
      var expectation2 = new Promise(function (resolve) {
        resolver2 = resolve;
      });
      this.emitter.on(event, function (message) {
        receivedMessage.push(message);
        if (receivedMessage.length === 2) {
          resolver();
        }
      });
      this.emitter.on('broker-test.#', function (message) {
        receivedMessage2.push(message);
        if (receivedMessage2.length === 2) {
          resolver2();
        }
      });

      return Promise.resolve().delay(1000)
        .then(function () {
          return self.emitter.emit(event, 'message-1');
        })
        .then(function () {
          return self.emitter.emit(event, 'message-2');
        })
        .then(function () {
          return expectation;
        })
        .then(function () {
          return expectation2;
        });
    });
  });
});
