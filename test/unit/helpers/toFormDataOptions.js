'use strict';

var assert = require('assert');
var toFormData = require('../../../lib/helpers/toFormData');
var AxiosError = require('../../../lib/core/AxiosError');

describe('helpers::toFormData options', function () {
  describe('inherited option properties', function () {
    function clearPollution() {
      delete Object.prototype.visitor;
      delete Object.prototype.maxDepth;
      delete Object.prototype.dots;
      delete Object.prototype.indexes;
      delete Object.prototype.metaTokens;
      delete Object.prototype.Blob;
    }

    function recorder() {
      var keys = [];
      var values = [];

      return {
        keys: keys,
        values: values,
        append: function append(key, value) {
          keys.push(key);
          values.push(value);
        }
      };
    }

    beforeEach(clearPollution);
    afterEach(clearPollution);

    it('should not use an inherited visitor', function () {
      var seen = [];

      Object.prototype.visitor = function pollutedVisitor(value, key, path, helpers) {
        seen.push(key);
        return helpers.defaultVisitor.call(this, value, key, path);
      };

      toFormData({ user: 'john', secret: 's3cr3t' }, recorder());

      assert.deepStrictEqual(seen, []);
    });

    it('should not use an inherited maxDepth', function () {
      Object.prototype.maxDepth = 1;

      assert.doesNotThrow(function () {
        toFormData({ a: { b: { c: 'value' } } }, recorder());
      });
    });

    it('should still honour an explicit maxDepth', function () {
      Object.prototype.maxDepth = 100;

      assert.throws(
        function () {
          toFormData({ a: { b: { c: 'value' } } }, recorder(), { maxDepth: 1 });
        },
        function (error) {
          return error instanceof AxiosError &&
            error.code === AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED;
        }
      );
    });

    it('should not use an inherited Blob implementation', function () {
      // This serializer takes no Blob option: binary values become a Blob only
      // when a Blob implementation is in scope, and a Buffer otherwise.
      //
      // The bare global Blob has to be taken out of the picture first, and
      // deleting it is not enough: the global object inherits from
      // Object.prototype too, so the pollution would simply resurface there.
      // Shadow it with an own undefined property instead, which leaves the
      // prototype as the only possible source of a Blob implementation.
      var globalBlob = Object.getOwnPropertyDescriptor(global, 'Blob');

      Object.defineProperty(global, 'Blob', {
        value: undefined,
        writable: true,
        enumerable: false,
        configurable: true
      });

      try {
        var polluted = false;

        Object.prototype.Blob = function PollutedBlob() {
          polluted = true;
        };

        assert.strictEqual(
          typeof Blob,
          'undefined',
          'the global Blob must be out of reach for this test to prove anything'
        );

        var form = recorder();

        // The caller passes an options object that says nothing about Blob, so
        // the only place a Blob implementation could come from is the prototype.
        toFormData({ file: new Uint8Array([1, 2, 3]) }, form, {});

        assert.deepStrictEqual(form.keys, ['file']);
        assert.ok(Buffer.isBuffer(form.values[0]));
        assert.strictEqual(polluted, false);
      } finally {
        if (globalBlob) {
          Object.defineProperty(global, 'Blob', globalBlob);
        } else {
          delete global.Blob;
        }
      }
    });

    it('should not let a polluted key mask a caller option', function () {
      // A truthy inherited value must not change how the caller's own options
      // are applied to the serialized keys.
      Object.prototype.dots = 'polluted';

      var form = recorder();
      toFormData({ a: { b: 'c' } }, form, { dots: true });

      assert.deepStrictEqual(form.keys, ['a.b']);
    });

    it('should keep default key formatting when a format flag is polluted', function () {
      // Nested keys are always joined with dots by this serializer.
      Object.prototype.dots = true;
      Object.prototype.indexes = true;

      var form = recorder();
      toFormData({ a: { b: 'c' } }, form);

      assert.deepStrictEqual(form.keys, ['a.b']);
    });
  });
});
