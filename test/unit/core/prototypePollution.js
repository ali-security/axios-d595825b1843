var assert = require('assert');
var utils = require('../../../lib/utils');
var mergeConfig = require('../../../lib/core/mergeConfig');
var dispatchRequest = require('../../../lib/core/dispatchRequest');
var axios = require('../../../index');
var AxiosError = require('../../../lib/core/AxiosError');

describe('Prototype Pollution Protection (node)', function () {
  function clearPollution() {
    delete Object.prototype.polluted;
    delete Object.prototype.auth;
    delete Object.prototype.username;
    delete Object.prototype.password;
    delete Object.prototype.headers;
    delete Object.prototype.common;
    delete Object.prototype.get;
    delete Object.prototype.set;
    delete Object.prototype.post;
  }

  function stubAdapter(store) {
    return function adapter(config) {
      store.config = config;

      return Promise.resolve({
        data: '',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config
      });
    };
  }

  beforeEach(clearPollution);
  afterEach(clearPollution);

  describe('utils.merge', function () {
    // The accumulator used to be a plain `{}`, so every value produced by
    // `merge` - config objects, header bags, `proxy` descriptors - inherited
    // from `Object.prototype` and served polluted keys back to axios as if the
    // caller had supplied them.
    it('should return a result that does not inherit from Object.prototype', function () {
      Object.prototype.polluted = 'attacker';

      var result = utils.merge({}, {safe: 'value'});

      assert.strictEqual(Object.getPrototypeOf(result), null);
      assert.strictEqual(result.polluted, undefined);
      assert.strictEqual(result.safe, 'value');
    });

    // The merge target used to be read with `result[key]`, which resolved
    // through the prototype chain: a polluted `Object.prototype.<key>` object
    // became the merge target and leaked all of its properties into the result.
    it('should not merge into a target inherited from Object.prototype', function () {
      Object.prototype.headers = {'x-polluted': 'yes'};

      var result = utils.merge({}, {headers: {Accept: 'application/json'}});

      assert.strictEqual(result.headers.Accept, 'application/json');
      assert.strictEqual(result.headers['x-polluted'], undefined);
    });

    it('should create nested plain objects that do not inherit proxy credentials', function () {
      Object.prototype.auth = 'polluted';
      Object.prototype.username = 'polluted-user';
      Object.prototype.password = 'polluted-pass';

      var result = utils.merge({}, {
        proxy: {
          host: 'localhost',
          nested: {
            enabled: true
          }
        }
      });

      assert.strictEqual(Object.getPrototypeOf(result.proxy), null);
      assert.strictEqual(Object.getPrototypeOf(result.proxy.nested), null);
      assert.strictEqual(result.proxy.auth, undefined);
      assert.strictEqual(result.proxy.username, undefined);
      assert.strictEqual(result.proxy.password, undefined);
      assert.strictEqual(result.proxy.nested.auth, undefined);
    });

    it('should not copy polluted inherited header buckets into nested headers', function () {
      Object.prototype.common = {'x-polluted-common': 'yes'};

      var result = utils.merge({}, {
        headers: {
          common: {
            Accept: 'application/json'
          },
          get: {
            'x-own-get': 'yes'
          }
        }
      });

      assert.strictEqual(result.headers.common.Accept, 'application/json');
      assert.strictEqual(result.headers.get['x-own-get'], 'yes');
      assert.strictEqual(result.headers.common['x-polluted-common'], undefined);
      assert.strictEqual(Object.getPrototypeOf(result.headers), null);
      assert.strictEqual(Object.getPrototypeOf(result.headers.common), null);
      assert.strictEqual(Object.getPrototypeOf(result.headers.get), null);
    });
  });

  describe('mergeConfig', function () {
    it('should create nested plain config objects that do not inherit proxy credentials', function () {
      Object.prototype.auth = 'polluted';
      Object.prototype.username = 'polluted-user';
      Object.prototype.password = 'polluted-pass';

      var result = mergeConfig({}, {
        proxy: {
          host: 'localhost',
          port: 4000
        }
      });

      assert.strictEqual(Object.getPrototypeOf(result.proxy), null);
      assert.strictEqual(result.proxy.auth, undefined);
      assert.strictEqual(result.proxy.username, undefined);
      assert.strictEqual(result.proxy.password, undefined);
    });

    // `ToPropertyDescriptor` probes the whole prototype chain for `get` / `set`,
    // so a polluted accessor turned every `{value: x}` descriptor literal into
    // an "invalid property descriptor" and made the merge throw.
    it('should not throw when Object.prototype get and set are polluted', function () {
      var thrown = null;

      Object.prototype.get = function () {};
      Object.prototype.set = function () {};

      try {
        mergeConfig({}, {
          url: '/users',
          headers: {
            common: {
              Accept: 'application/json'
            }
          }
        });
      } catch (error) {
        thrown = error;
      }

      // Restore before mocha's own descriptor-using internals run again.
      clearPollution();

      assert.strictEqual(thrown, null, 'mergeConfig threw: ' + (thrown && thrown.message));
    });
  });

  describe('AxiosError descriptors', function () {
    it('should be defined without inherited getter or setter keys', function () {
      var axiosErrorPath = require.resolve('../../../lib/core/AxiosError');
      var cached = require.cache[axiosErrorPath];
      var thrown = null;

      Object.prototype.get = function () {};
      Object.prototype.set = function () {};

      delete require.cache[axiosErrorPath];
      try {
        require('../../../lib/core/AxiosError');
      } catch (error) {
        thrown = error;
      }
      require.cache[axiosErrorPath] = cached;

      clearPollution();

      assert.strictEqual(thrown, null, 'AxiosError failed to load: ' + (thrown && thrown.message));
    });
  });

  describe('dispatchRequest header flattening', function () {
    // The `common` / per-method header buckets used to be read through the
    // prototype chain, so a polluted `Object.prototype.common` (or `.get`,
    // `.post`, ...) injected headers into every outgoing request.
    it('should not pick up header buckets inherited from Object.prototype', function (done) {
      var seen = null;
      var promise = null;
      var thrown = null;

      var config = {
        method: 'get',
        url: '/users',
        headers: {'x-request': 'request'},
        transformRequest: [],
        transformResponse: [],
        adapter: function adapter(requestConfig) {
          seen = requestConfig.headers;
          return Promise.resolve({
            data: null,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: requestConfig
          });
        }
      };

      Object.prototype.common = {'x-polluted-common': 'yes'};
      Object.prototype.get = {'x-polluted-get': 'yes'};

      try {
        promise = dispatchRequest(config);
      } catch (error) {
        thrown = error;
      }

      // Restore synchronously: the adapter is invoked from inside
      // `dispatchRequest`, so everything under test has already run, and a
      // polluted prototype must never outlive it into mocha's own internals.
      clearPollution();

      if (thrown) {
        done(thrown);
        return;
      }

      promise.then(function () {
        assert.strictEqual(seen['x-request'], 'request');
        assert.strictEqual(seen['x-polluted-common'], undefined);
        assert.strictEqual(seen['x-polluted-get'], undefined);
        done();
      }, done);
    });

    it('should prepare request headers without descriptor errors when get and set are polluted', function (done) {
      var seenAccept;
      var promise = null;
      var thrown = null;

      Object.prototype.get = function () {};
      Object.prototype.set = function () {};

      try {
        var instance = axios.create({
          adapter: function adapter(config) {
            seenAccept = config.headers.Accept;
            return Promise.resolve({
              data: null,
              status: 200,
              statusText: 'OK',
              headers: {},
              config: config
            });
          },
          headers: {
            common: {
              Accept: 'application/json'
            }
          }
        });

        promise = instance.get('/users');
      } catch (error) {
        thrown = error;
      }

      clearPollution();

      if (thrown) {
        done(new Error('polluted get/set broke request preparation: ' + thrown.message));
        return;
      }

      promise.then(function () {
        assert.strictEqual(seenAccept, 'application/json');
        done();
      }, done);
    });
  });

  describe('dispatchRequest headers', function () {
    it('should not take request headers from Object.prototype', function () {
      Object.prototype.headers = { 'X-Poisoned': 'yes' };

      var store = {};

      // A request interceptor may return a replacement config that is an
      // ordinary object without an own headers property.
      return dispatchRequest({
        url: 'http://example.com/resource',
        method: 'get',
        adapter: stubAdapter(store)
      }).then(function () {
        assert.strictEqual(store.config.headers['X-Poisoned'], undefined);
      });
    });

    it('should still use own request headers', function () {
      Object.prototype.headers = { 'X-Poisoned': 'yes' };

      var store = {};

      return dispatchRequest({
        url: 'http://example.com/resource',
        method: 'get',
        headers: { 'X-Wanted': 'yes' },
        adapter: stubAdapter(store)
      }).then(function () {
        assert.strictEqual(store.config.headers['X-Wanted'], 'yes');
        assert.strictEqual(store.config.headers['X-Poisoned'], undefined);
      });
    });
  });

  describe('utils.toFlatObject', function () {
    it('should not copy __proto__ or constructor from the source object', function () {
      var source = {};
      Object.defineProperty(source, '__proto__', {
        value: { polluted: 'yes' },
        enumerable: true,
        configurable: true,
        writable: true
      });

      source.constructor = function Evil() {};

      var result = utils.toFlatObject(source, {});

      assert.strictEqual(Object.getPrototypeOf(result), Object.prototype);
      assert.strictEqual(result.polluted, undefined);
      assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'constructor'), false);
    });

    it('should keep AxiosError.from intact for an error carrying an own __proto__', function () {
      var error = new Error('boom');
      Object.defineProperty(error, '__proto__', {
        value: { hijacked: true },
        enumerable: true,
        configurable: true,
        writable: true
      });

      var axiosError = AxiosError.from(error, 'ERR_TEST');

      assert.ok(axiosError instanceof AxiosError);
      assert.strictEqual(axiosError.message, 'boom');
    });
  });
});
