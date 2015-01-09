'use strict';
/**
 * Root tests
 *
 * @author Chen Liang [code@chen.technology]
 */

/*!
 * Module dependencies.
 */
var chai = require('chai');
var urlLib = require('url');

global.expect = chai.expect;
chai.should();
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
global.sinon = require('sinon');

var debug = require('debug')('broker-emitter:test:root');
before(function () {
  var uri = process.env.URI || 'amqp://localhost';
  debug('uri', uri);
  this.uri = uri;
});
