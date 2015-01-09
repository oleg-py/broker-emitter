'use strict';
/**
 * RabbitMQ Event Emitter
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var broker = require('broker-node');
var Promise = require('bluebird');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var uuid = require('node-uuid');
var _ = require('lodash');
var debug = require('debug')('broker-emitter');

/**
 * [Emitter description]
 * @param {[type]} options [description]
 * @param {[type]} optinos.uri [description]
 * @param {[type]} options.connection use an existing connection
 * @param {[type]} options.exchangeName [description]
 * @param {[type]} options.routingKey [description]
 * @param {[type]} options.exchangeType @default topic
 */
var Emitter = function (options) {
  EventEmitter.call(this);
  this._options = options || {};
  this.connection = this._options.connection || new broker.Connection({
    uri: this._options.uri
  });

  this.namePrefix = this._options.namePrefix || 'broker-emitter-';

  this.name = this.namePrefix + uuid.v4();

  this.exchangeName = this._options.exchangeName;
  if (!this.exchangeName) {
    throw new Error('exchangeName is required');
  }
  this.exchangeType = this._options.exchangeType || 'topic';
  this.routingKey = this._options.routingKey;
  this.exchange = new broker.Exchange({
    name: this.exchangeName,
    type: this.exchangeType,
    deliveryMode: true,
    durable: true,
    autoDelete: false,
    // channel: this.channel
  });
  this.producer = new broker.Producer({
    routingKey: this.routingKey,
    channel: this.channel(),
    exchange: this.exchange
  });
  // {event: {consumer,listener}}
  this.eventListeners = {};
};

inherits(Emitter, EventEmitter);
// Store overridden EventEmitter methods as private
Emitter.prototype._emit = Emitter.prototype.emit;
Emitter.prototype._addListener = Emitter.prototype.addListener;
Emitter.prototype._removeListener = Emitter.prototype.removeListener;
Emitter.prototype._removeAllListeners = Emitter.prototype.removeAllListeners;

/**
 * Create and return a new channel.
 *
 * @return {broker.Channel} [description]
 */
Emitter.prototype.channel = function () {
  return this.connection.channel();
};

Emitter.prototype.connect = function () {
  debug('connect');
  var self = this;
  return this.connection.connect()
    .then(function () {
      return self.producer.declare();
    });
};

Emitter.prototype.emit = function (event, data) {
  debug('emit', event, data);
  return this.producer.route({
      routingKey: event
    })
    .publish(data);
};

Emitter.prototype.getEventHandler = function (event) {
  debug('getEventHandler', event);
  var self = this;
  return function (message) {
    debug('event received', event, message ? message.body : 'empty message');
    self._emit(event, message);
  };
};

Emitter.prototype.addEventConsumer = function (event, listener) {
  debug('addEventConsumer', event, listener);
  var queue = new broker.Queue({
    name: this.name + '-event-' + uuid.v4(),
    routingKey: event,
    exchange: this.exchange,
    exclusive: true,
    autoDelete: true,
    durable: false,
  });
  var consumer = new broker.Consumer({
    noAck: true,
    channel: this.channel(),
    queues: [queue],
    messageHandler: this.getEventHandler(event)
  });
  this.eventListeners[event] = consumer;
  return consumer.declare()
    .then(function () {
      return consumer.consume();
    });
};

Emitter.prototype.removeEventConsumer = function (event) {
  debug('removeEventConsumer', event);
  var consumer = this.eventListeners[event];
  if (consumer) {
    consumer.cancel()
      .then(function () {
        debug('removeEventConsumer', event, 'canceled');
      });
  }
};

Emitter.prototype.addListener = function (event, listener) {
  debug('addListener', 'event', listener);
  // check if the event exists in `eventListeners`
  var setupConsumer;
  if (this.eventListeners[event]) {
    setupConsumer = Promise.resolve();
  } else {
    setupConsumer = this.addEventConsumer(event, listener);
  }
  this._addListener(event, listener);
  setupConsumer
    .then(function () {
      debug('addListener', event, 'listening');
    });
  return this;
};

/**
 * An alias for addListener.
 *
 * @see addListener
 */
Emitter.prototype.on = Emitter.prototype.addListener;

/**
 * If no listener left, remove consumer
 *
 * @param  {[type]} event    [description]
 * @param  {[type]} listener [description]
 * @return {Emitter}          [description]
 */
Emitter.prototype.removeListener = function (event, listener) {
  debug('removeListener', event, listener);
  this.removeListener(event, listener);
  if (this.listeners(event).length === 0) {
    this.removeEventConsumer(event);
  }
  return this;
};

Emitter.prototype.removeAllListeners = function (events) {
  debug('removeAllListeners', events);
  this._removeAllListeners(events);
  var self = this;
  if (events && _.isArray(events)) {
    _.forEach(events, function (event) {
      if (self.listeners(event).length === 0) {
        self.removeEventConsumer(event);
      }
    });
  }
  return this;
};


module.exports = Emitter;
