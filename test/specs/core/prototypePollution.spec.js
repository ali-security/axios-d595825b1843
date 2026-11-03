var utils = require('../../../lib/utils');
var mergeConfig = require('../../../lib/core/mergeConfig');

describe('Prototype Pollution Protection', function() {
  afterEach(function() {
    // Clean up any pollution that might have occurred
    delete Object.prototype.polluted;
  });

  describe('utils.merge', function() {
    it('should filter __proto__ key at top level', function() {
      var result = utils.merge({}, {__proto__: {polluted: 'yes'}, safe: 'value'});

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.safe).toEqual('value');
      expect(result.hasOwnProperty('__proto__')).toBe(false);
    });

    it('should filter constructor key at top level', function() {
      var result = utils.merge({}, {constructor: {polluted: 'yes'}, safe: 'value'});

      expect(result.safe).toEqual('value');
      expect(result.hasOwnProperty('constructor')).toBe(false);
    });

    it('should filter prototype key at top level', function() {
      var result = utils.merge({}, {prototype: {polluted: 'yes'}, safe: 'value'});

      expect(result.safe).toEqual('value');
      expect(result.hasOwnProperty('prototype')).toBe(false);
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
      expect(result.headers.hasOwnProperty('__proto__')).toBe(false);
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
      expect(result.headers.hasOwnProperty('constructor')).toBe(false);
    });

    it('should filter prototype key in nested objects', function() {
      var result = utils.merge({}, {
        headers: {
          prototype: {polluted: 'nested'},
          'Content-Type': 'application/json'
        }
      });

      expect(result.headers['Content-Type']).toEqual('application/json');
      expect(result.headers.hasOwnProperty('prototype')).toBe(false);
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
      expect(result.level1.level2.hasOwnProperty('__proto__')).toBe(false);
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
      expect(result.hasOwnProperty('__proto__')).toBe(false);
    });

    it('should handle nested JSON.parse payloads safely', function() {
      var malicious = JSON.parse('{"headers": {"constructor": {"prototype": {"polluted": "yes"}}}}');
      var result = utils.merge({}, malicious);

      expect(Object.prototype.polluted).toBeUndefined();
      expect(result.headers.hasOwnProperty('constructor')).toBe(false);
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
      expect(result.hasOwnProperty('__proto__')).toBe(false);
      expect(result.hasOwnProperty('constructor')).toBe(false);
      expect(result.hasOwnProperty('prototype')).toBe(false);
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
      expect(result.headers.hasOwnProperty('__proto__')).toBe(false);
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
      expect(result.customProp.hasOwnProperty('__proto__')).toBe(false);
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
});
