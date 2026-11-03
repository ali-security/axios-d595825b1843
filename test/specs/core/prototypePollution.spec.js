var utils = require('../../../lib/utils');
var mergeConfig = require('../../../lib/core/mergeConfig');
var defaults = require('../../../lib/defaults');
var validator = require('../../../lib/helpers/validator');

describe('Prototype Pollution Protection', function() {
  afterEach(function() {
    // Clean up any pollution that might have occurred
    delete Object.prototype.polluted;
    delete Object.prototype.transport;
    delete Object.prototype.transformRequest;
    delete Object.prototype.transformResponse;
    delete Object.prototype.formSerializer;
    delete Object.prototype.env;
    delete Object.prototype.parseReviver;
    delete Object.prototype.adapter;
    delete Object.prototype.validateStatus;
    delete Object.prototype.data;
    delete Object.prototype.auth;
    delete Object.prototype.username;
    delete Object.prototype.password;
    delete Object.prototype.baseURL;
    delete Object.prototype.url;
    delete Object.prototype.allowAbsoluteUrls;
    delete Object.prototype.socketPath;
    delete Object.prototype.beforeRedirect;
    delete Object.prototype.insecureHTTPParser;
    delete Object.prototype.xsrfHeaderName;
    delete Object.prototype.xsrfCookieName;
    delete Object.prototype.withXSRFToken;
    delete Object.prototype.headers;
    delete Object.prototype.common;
    delete Object.prototype.params;
    delete Object.prototype.paramsSerializer;
    delete Object.prototype.timeout;
  });

  describe('utils.merge', function() {
    it('should filter __proto__ key at top level', function() {
      var result = utils.merge({}, {__proto__: {polluted: 'yes'}, safe: 'value'});

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.safe).toEqual('value');
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    });

    it('should filter constructor key at top level', function() {
      var result = utils.merge({}, {constructor: {polluted: 'yes'}, safe: 'value'});

      expect(result.safe).toEqual('value');
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
    });

    it('should filter prototype key at top level', function() {
      var result = utils.merge({}, {prototype: {polluted: 'yes'}, safe: 'value'});

      expect(result.safe).toEqual('value');
      expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
    });

    it('should filter __proto__ key in nested objects', function() {
      var result = utils.merge({}, {
        headers: {
          __proto__: {polluted: 'nested'},
          'Content-Type': 'application/json'
        }
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.headers['Content-Type']).toEqual('application/json');
      expect(Object.prototype.hasOwnProperty.call(result.headers, '__proto__')).toBe(false);
    });

    it('should filter constructor key in nested objects', function() {
      var result = utils.merge({}, {
        headers: {
          constructor: {prototype: {polluted: 'nested'}},
          'Content-Type': 'application/json'
        }
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.headers['Content-Type']).toEqual('application/json');
      expect(Object.prototype.hasOwnProperty.call(result.headers, 'constructor')).toBe(false);
    });

    it('should filter prototype key in nested objects', function() {
      var result = utils.merge({}, {
        headers: {
          prototype: {polluted: 'nested'},
          'Content-Type': 'application/json'
        }
      });

      expect(result.headers['Content-Type']).toEqual('application/json');
      expect(Object.prototype.hasOwnProperty.call(result.headers, 'prototype')).toBe(false);
    });

    it('should filter dangerous keys in deeply nested objects', function() {
      var result = utils.merge({}, {
        level1: {
          level2: {
            __proto__: {polluted: 'deep'},
            prototype: {polluted: 'deep'},
            safe: 'value'
          }
        }
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.level1.level2.safe).toEqual('value');
      expect(Object.prototype.hasOwnProperty.call(result.level1.level2, '__proto__')).toBe(false);
    });

    it('should still merge regular properties correctly', function() {
      var result = utils.merge({a: 1, b: {c: 2}}, {b: {d: 3}, e: 4});

      expect(result.a).toEqual(1);
      expect(result.b.c).toEqual(2);
      expect(result.b.d).toEqual(3);
      expect(result.e).toEqual(4);
    });

    it('should handle JSON.parse payloads safely', function() {
      var malicious = JSON.parse('{"__proto__": {"polluted": "yes"}}');
      var result = utils.merge({}, malicious);

      expect(Object.prototype.polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
    });

    it('should handle nested JSON.parse payloads safely', function() {
      var malicious = JSON.parse('{"headers": {"constructor": {"prototype": {"polluted": "yes"}}}}');
      var result = utils.merge({}, malicious);

      expect(Object.prototype.polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(result.headers, 'constructor')).toBe(false);
    });

    // GHSA-6vg4-46jg-52hv: the accumulator used to be a plain `{}`, so every
    // value produced by `merge` - config objects, header bags, `proxy`
    // descriptors - inherited from `Object.prototype` and served polluted keys
    // back as if the caller had supplied them.
    it('should return a result that does not inherit from Object.prototype', function() {
      Object.prototype.polluted = 'attacker';

      var result = utils.merge({}, {safe: 'value'});

      expect(Object.getPrototypeOf(result)).toBe(null);
      expect(result.polluted).toBeUndefined();
      expect(result.safe).toEqual('value');
    });

    // The merge target used to be looked up with `result[key]`, which resolved
    // through the prototype chain: a polluted `Object.prototype.<key>` object
    // became the target and leaked all of its properties into the result.
    it('should not merge into a target inherited from Object.prototype', function() {
      Object.prototype.headers = {'x-polluted': 'yes'};

      var result = utils.merge({}, {headers: {Accept: 'application/json'}});

      expect(result.headers.Accept).toEqual('application/json');
      expect(result.headers['x-polluted']).toBeUndefined();
    });

    it('should create nested plain objects that do not inherit proxy credentials', function() {
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

      expect(Object.getPrototypeOf(result.proxy)).toBe(null);
      expect(Object.getPrototypeOf(result.proxy.nested)).toBe(null);
      expect(result.proxy.auth).toBeUndefined();
      expect(result.proxy.username).toBeUndefined();
      expect(result.proxy.password).toBeUndefined();
      expect(result.proxy.nested.auth).toBeUndefined();
    });

    it('should not copy polluted inherited header buckets into nested headers', function() {
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

      expect(result.headers.common.Accept).toEqual('application/json');
      expect(result.headers.get['x-own-get']).toEqual('yes');
      expect(result.headers.common['x-polluted-common']).toBeUndefined();
      expect(Object.getPrototypeOf(result.headers)).toBe(null);
      expect(Object.getPrototypeOf(result.headers.common)).toBe(null);
      expect(Object.getPrototypeOf(result.headers.get)).toBe(null);
    });
  });

  describe('mergeConfig', function() {
    it('should filter dangerous keys at top level', function() {
      var result = mergeConfig({}, {
        __proto__: {polluted: 'yes'},
        constructor: {polluted: 'yes'},
        prototype: {polluted: 'yes'},
        url: '/api/test'
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.url).toEqual('/api/test');
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
    });

    it('should filter dangerous keys in headers', function() {
      var result = mergeConfig({}, {
        headers: {
          __proto__: {polluted: 'yes'},
          'Content-Type': 'application/json'
        }
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.headers['Content-Type']).toEqual('application/json');
      expect(Object.prototype.hasOwnProperty.call(result.headers, '__proto__')).toBe(false);
    });

    it('should filter dangerous keys in custom config properties', function() {
      var result = mergeConfig({}, {
        customProp: {
          __proto__: {polluted: 'yes'},
          safe: 'value'
        }
      });

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.customProp.safe).toEqual('value');
      expect(Object.prototype.hasOwnProperty.call(result.customProp, '__proto__')).toBe(false);
    });

    it('should create nested plain config objects that do not inherit proxy credentials', function() {
      Object.prototype.auth = 'polluted';
      Object.prototype.username = 'polluted-user';
      Object.prototype.password = 'polluted-pass';

      var result = mergeConfig({}, {
        proxy: {
          host: 'localhost',
          port: 4000
        }
      });

      expect(Object.getPrototypeOf(result.proxy)).toBe(null);
      expect(result.proxy.auth).toBeUndefined();
      expect(result.proxy.username).toBeUndefined();
      expect(result.proxy.password).toBeUndefined();
    });

    it('should not inherit transport from Object.prototype', function() {
      Object.prototype.transport = {request: function() {}};

      var result = mergeConfig({}, {url: '/a'});

      expect(Object.prototype.hasOwnProperty.call(result, 'transport')).toBe(false);
    });

    it('should not inherit transformRequest from Object.prototype', function() {
      Object.prototype.transformRequest = function() { return 'hijacked'; };

      var result = mergeConfig({}, {url: '/a'});

      expect(Object.prototype.hasOwnProperty.call(result, 'transformRequest')).toBe(false);
    });

    it('should not inherit transformResponse from Object.prototype', function() {
      Object.prototype.transformResponse = function() { return 'hijacked'; };

      var result = mergeConfig({}, {url: '/a'});

      expect(Object.prototype.hasOwnProperty.call(result, 'transformResponse')).toBe(false);
    });

    it('should not inherit arbitrary keys from Object.prototype', function() {
      Object.prototype.polluted = 'yes';

      var result = mergeConfig({}, {url: '/a'});

      expect(Object.prototype.hasOwnProperty.call(result, 'polluted')).toBe(false);
    });

    // The merge map walks every own key of either config, so a key owned by the
    // defaults (config1) is visited even when the request config (config2) only
    // inherits it. Without own-property guards the inherited value wins.
    it('should not let an inherited transformRequest override the configured one', function() {
      var original = function original() { return 'original'; };
      Object.prototype.transformRequest = function polluted() { return 'hijacked'; };

      var result = mergeConfig({transformRequest: original}, {url: '/a'});

      expect(result.transformRequest).toBe(original);
      expect(result.transformRequest()).toEqual('original');
    });

    it('should not let an inherited transformResponse override the configured one', function() {
      var original = function original() { return 'original'; };
      Object.prototype.transformResponse = function polluted() { return 'hijacked'; };

      var result = mergeConfig({transformResponse: original}, {url: '/a'});

      expect(result.transformResponse).toBe(original);
      expect(result.transformResponse()).toEqual('original');
    });

    it('should not let an inherited adapter override the configured adapter', function() {
      var original = function original() {};
      Object.prototype.adapter = function polluted() {};

      var result = mergeConfig({adapter: original}, {url: '/a'});

      expect(result.adapter).toBe(original);
    });

    it('should not let an inherited transport override the configured transport', function() {
      var original = function original() {};
      Object.prototype.transport = function polluted() {};

      var result = mergeConfig({transport: original}, {url: '/a'});

      expect(result.transport).toBe(original);
    });

    // validateStatus is merged with mergeDirectKeys, which used to probe the
    // whole prototype chain with `prop in config`.
    it('should not let an inherited validateStatus override the configured one', function() {
      var original = function original(status) { return status === 200; };
      Object.prototype.validateStatus = function polluted() { return true; };

      var result = mergeConfig({validateStatus: original}, {url: '/a'});

      expect(result.validateStatus).toBe(original);
      expect(result.validateStatus(500)).toBe(false);
    });

    it('should not let an inherited env override the configured env', function() {
      var ownFormData = function OwnFormData() {};
      Object.prototype.env = {FormData: function PollutedFormData() {}};

      var result = mergeConfig({env: {FormData: ownFormData}}, {url: '/a'});

      expect(result.env.FormData).toBe(ownFormData);
    });

    it('should not take an inherited value for a config2-only key', function() {
      Object.prototype.data = 'polluted';

      var result = mergeConfig({data: 'own'}, {url: '/a'});

      expect(Object.prototype.hasOwnProperty.call(result, 'data')).toBe(false);
    });

    it('should still merge configs correctly', function() {
      var config1 = {
        baseURL: 'https://api.example.com',
        timeout: 1000,
        headers: {
          common: {
            Accept: 'application/json'
          }
        }
      };

      var config2 = {
        url: '/users',
        timeout: 5000,
        headers: {
          common: {
            'Content-Type': 'application/json'
          }
        }
      };

      var result = mergeConfig(config1, config2);

      expect(result.baseURL).toEqual('https://api.example.com');
      expect(result.url).toEqual('/users');
      expect(result.timeout).toEqual(5000);
      expect(result.headers.common.Accept).toEqual('application/json');
      expect(result.headers.common['Content-Type']).toEqual('application/json');
    });
  });

  // GHSA-q8qp-cvcw-x6jj: mergeConfig now returns a null-prototype object, so a
  // property that is not an own property of the merged config can never be
  // supplied by a polluted Object.prototype.
  describe('mergeConfig null-prototype structure', function() {
    it('should return an object whose prototype is null', function() {
      var merged = mergeConfig({url: '/x'}, {method: 'get'});

      expect(Object.getPrototypeOf(merged)).toBe(null);
    });

    it('should preserve hasOwnProperty as a callable own slot', function() {
      var merged = mergeConfig({}, {url: '/x', method: 'get'});

      expect(typeof merged.hasOwnProperty).toEqual('function');
      expect(merged.hasOwnProperty('url')).toBe(true);
      expect(merged.hasOwnProperty('method')).toBe(true);
      expect(merged.hasOwnProperty('bogus')).toBe(false);
    });

    it('should not expose the hasOwnProperty slot as an enumerable key', function() {
      var merged = mergeConfig({}, {url: '/x'});

      expect(Object.keys(merged).indexOf('hasOwnProperty')).toEqual(-1);
      expect(JSON.stringify(merged)).toEqual('{"url":"/x"}');
    });

    it('should not read arbitrary polluted keys off the merged config', function() {
      Object.prototype.polluted = 'attacker';
      Object.prototype.baseURL = 'http://attacker.example.com';
      Object.prototype.auth = {username: 'attacker', password: 'exfil'};
      Object.prototype.socketPath = '/tmp/attacker.sock';
      Object.prototype.beforeRedirect = function() {};
      Object.prototype.insecureHTTPParser = true;

      var merged = mergeConfig({url: '/x'}, {});

      expect(merged.polluted).toBeUndefined();
      expect(merged.baseURL).toBeUndefined();
      expect(merged.auth).toBeUndefined();
      expect(merged.socketPath).toBeUndefined();
      expect(merged.beforeRedirect).toBeUndefined();
      expect(merged.insecureHTTPParser).toBeUndefined();
    });
  });

  // GHSA-q8qp-cvcw-x6jj: assertOptions used to look the validator up through
  // the prototype chain, so a polluted Object.prototype.<option> supplied a
  // non-function "validator" and produced a TypeError instead of the documented
  // AxiosError.
  describe('validator.assertOptions', function() {
    it('should not take a validator inherited from Object.prototype', function() {
      Object.prototype.polluted = 'not a function';

      var thrown = null;
      try {
        validator.assertOptions({polluted: true}, {}, false);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).not.toBe(null);
      expect(thrown.code).toEqual('ERR_BAD_OPTION');
      expect(thrown.message).toEqual('Unknown option polluted');
    });

    it('should not throw for an unknown option when allowUnknown is set', function() {
      Object.prototype.polluted = 'not a function';

      var thrown = null;
      try {
        validator.assertOptions({polluted: true}, {}, true);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBe(null);
    });

    it('should still run validators that the schema owns', function() {
      var thrown = null;
      try {
        validator.assertOptions({silentJSONParsing: 'nope'}, {
          silentJSONParsing: validator.validators.boolean
        }, false);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).not.toBe(null);
      expect(thrown.code).toEqual('ERR_BAD_OPTION_VALUE');
    });
  });

  // The browser adapter reads the same fields; an inherited value must never
  // reach the XMLHttpRequest.
  describe('xhr adapter', function() {
    beforeEach(function() {
      jasmine.Ajax.install();
    });

    afterEach(function() {
      jasmine.Ajax.uninstall();
    });

    it('should not send an Authorization header inherited from Object.prototype', function(done) {
      Object.prototype.auth = {username: 'attacker', password: 'exfil'};

      axios('/foo');

      setTimeout(function() {
        var request = jasmine.Ajax.requests.mostRecent();

        expect(request.requestHeaders['Authorization']).toBeUndefined();
        done();
      }, 100);
    });

    it('should not prefix the request url with a baseURL inherited from Object.prototype', function(done) {
      Object.prototype.baseURL = 'http://attacker.example.com';

      axios('/foo');

      setTimeout(function() {
        var request = jasmine.Ajax.requests.mostRecent();

        expect(request.url).toEqual('/foo');
        done();
      }, 100);
    });
  });

  describe('defaults.transformRequest', function() {
    it('should not use a FormData constructor inherited from Object.prototype', function() {
      var used = false;

      function PollutedFormData() {
        used = true;
      }
      PollutedFormData.prototype.append = function append() {};

      Object.prototype.env = {FormData: PollutedFormData};

      var result = defaults.transformRequest[0]({x: 1}, {'Content-Type': 'multipart/form-data'});

      expect(used).toBe(false);
      expect(result instanceof PollutedFormData).toBe(false);
      expect(result).toEqual(jasmine.any(FormData));
    });
  });
});
