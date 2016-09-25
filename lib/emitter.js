/**
 * RabbitMQ Event Emitter
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
const broker = require('broker-node');
const Promise = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const uuid = require('node-uuid');
const _ = require('lodash');
const debug = require('debug')('broker-emitter');

/**
 * [Emitter description]
 * @param {[type]} options [description]
 * @param {[type]} optinos.uri [description]
 * @param {[type]} options.connection use an existing connection
 * @param {[type]} options.exchangeName [description]
 * @param {[type]} options.namePrefix [description]
 * @param {[type]} options.routingKey [description]
 * @param {[type]} options.exchangeType @default topic
 */
class Emitter extends EventEmitter {
  constructor(options) {
    super();

    this._options = options || {};
    this.connection = this._options.connection || new broker.Connection({
      uri: this._options.uri,
    });

    this.namePrefix = this._options.namePrefix || 'broker-emitter-';

    this.name = this.namePrefix + '-' + uuid.v4();

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
      exchange: this.exchange,
    });
    // {event: {consumer,listener}}
    this.eventListeners = {};
  }

  // Store overridden EventEmitter methods as private
  // _emit() {
  //   return super.emit(arguments);
  // }
  //
  // _addListener() {
  //   return super.addListener(arguments)
  // }
  //
  // _removeListener() {
  //   return super.removeListener(arguments);
  // }
  //
  // _removeAllListeners() {
  //   return super.removeAllListeners(arguments);
  // }

  /**
   * Create and return a new channel.
   *
   * @return {broker.Channel} [description]
   */
  channel() {
    return this.connection.channel();
  }

  /**
   * Establish Connection to RabbitMQ
   * @return {[type]} [description]
   */
  connect() {
    debug('connect');
    return this.connection.connect()
      .then(() => this.producer.declare());
  };

  /**
   * Send a message
   * @param {String} event will be used as routingKey
   * @param {Object} data  [description]
   * @param {Object} options options will be passed to producer.route.publish
   * @param {[type]} options.headers [description]
   * @return {[type]} [description]
   */
  emit(event, data, options) {
    debug('emit', event, data);
    options = options || {};
    options.routingKey = options.routingKey || event;
    return this.producer.route(options)
      .publish(data);
  };

  getEventHandler(event) {
    debug('getEventHandler', event);
    return (message) => {
      debug('event received', event, message ? message.body : 'empty message');
      super.emit(event, message);
    };
  };

  addEventConsumer(event, listener) {
    debug('addEventConsumer', event, listener);
    var queue = new broker.Queue({
      name: this.name + '.event.' + event + '.' + uuid.v4(),
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
      messageHandler: this.getEventHandler(event),
    });
    this.eventListeners[event] = consumer;
    return consumer.declare()
      .then(() => consumer.consume());
  };

  removeEventConsumer(event) {
    debug('removeEventConsumer', event);
    var consumer = this.eventListeners[event];
    if (consumer) {
      consumer.cancel()
        .then(() => {
          debug('removeEventConsumer', event, 'canceled');
          // need to close the channel
          return consumer.channel.close();
        })
        .then(() => {
          debug('removeEventConsumer', event, 'channel closed');
          delete this.eventListeners[event];
        });
    }
  };

  addListener(event, listener) {
    debug('addListener', event, listener);
    // check if the event exists in `eventListeners`
    var setupConsumer;
    if (this.eventListeners[event]) {
      setupConsumer = Promise.resolve();
    } else {
      setupConsumer = this.addEventConsumer(event, listener);
    }
    // use EventEmitter to pass the event
    super.on(event, listener);
    return setupConsumer
      .then(() => debug('addListener', event, 'listening'))
      .then(() => this);
  };

  /**
   * An alias for addListener.
   *
   * @see addListener
   */
  on(event, handler, options) {
    return this.addListener(event, handler, options);
  }

  once(event, handler, options) {
    debug('once', event);

    const wrappedHandler = (payload) => {
      handler(payload);
      this.removeListener(event);
    }
    super.once(event, wrappedHandler);
    return this.on(event, wrappedHandler, options);
  }

  /**
   * If no listener left, remove consumer
   *
   * @param  {[type]} event    [description]
   * @param  {[type]} listener [description]
   * @return {Emitter}          [description]
   */
  removeListener(event, listener) {
    debug('removeListener', event, listener);
    super.removeListener(event, listener);
    if (this.listeners(event).length === 0) {
      this.removeEventConsumer(event);
    }
    return this;
  };

  removeAllListeners(events) {
    debug('removeAllListeners', events);
    super.removeAllListeners(events);
    if (events && _.isArray(events)) {
      _.forEach(events, (event) => {
        if (this.listeners(event).length === 0) {
          this.removeEventConsumer(event);
        }
      });
    }
    return this;
  };

}

module.exports = Emitter;
