'use strict';

var assert = require('assert');
var buildURL = require('../../../lib/helpers/buildURL');

function pollute(name, value) {
  // A non-enumerable descriptor keeps the pollution invisible to `for..in`
  // loops, which is exactly how a real prototype-pollution gadget behaves.
  var descriptor = Object.create(null);
  descriptor.value = value;
  descriptor.configurable = true;
  Object.defineProperty(Object.prototype, name, descriptor);
}

describe('helpers::buildURL', function () {
  afterEach(function () {
    delete Object.prototype.encode;
    delete Object.prototype.serialize;
    delete Object.prototype.paramsSerializer;
  });

  // `buildURL` must take its serializer/encoder exclusively from the argument
  // the caller passed. Resolving them through the prototype chain would let a
  // polluted `Object.prototype` rewrite the query string of every request.
  it('should ignore inherited params serializer options', function () {
    pollute('encode', function pollutedEncode() {
      return 'polluted';
    });
    pollute('serialize', function pollutedSerialize() {
      return 'polluted=1';
    });
    pollute('paramsSerializer', function pollutedParamsSerializer() {
      return 'polluted=1';
    });

    assert.strictEqual(buildURL('/foo', { a: 'b c' }), '/foo?a=b+c');
  });

  it('should still use an explicitly provided params serializer', function () {
    pollute('serialize', function pollutedSerialize() {
      return 'polluted=1';
    });

    var serialized = buildURL('/foo', { a: 'b c' }, function serialize(params) {
      return 'safe=' + params.a;
    });

    assert.strictEqual(serialized, '/foo?safe=b c');
  });
});
