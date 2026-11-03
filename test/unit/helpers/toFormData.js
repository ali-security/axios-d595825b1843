'use strict';

var assert = require('assert');
var toFormData = require('../../../lib/helpers/toFormData');
var AxiosError = require('../../../lib/core/AxiosError');

function FormDataStub() {
  this.entries = [];
}

FormDataStub.prototype.append = function append(key, value) {
  this.entries.push([key, value]);
};

function buildDeep(depth) {
  var head = {};
  var cur = head;

  for (var i = 0; i < depth; i++) {
    cur.x = {};
    cur = cur.x;
  }

  return head;
}

describe('helpers::toFormData', function () {
  describe('depth limit', function () {
    // The recursive `build()` guard never saw the values handed straight to
    // `JSON.stringify` by the `key{}` meta token, so a deeply nested payload
    // crashed the process with an uncatchable stack overflow.
    it('should depth-check objects stringified by the meta token', function () {
      assert.throws(function () {
        toFormData({ 'evil{}': buildDeep(10000) }, new FormDataStub());
      }, function (err) {
        return Boolean(err) && err.code === AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED;
      });
    });

    it('should depth-check meta token values against a custom maxDepth', function () {
      assert.throws(function () {
        toFormData({ 'evil{}': buildDeep(10) }, new FormDataStub(), { maxDepth: 5 });
      }, function (err) {
        return Boolean(err) && err.code === AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED;
      });
    });

    it('should still stringify shallow meta token values', function () {
      var form = new FormDataStub();

      toFormData({ 'payload{}': { a: 1 } }, form);

      assert.strictEqual(form.entries.length, 1);
      assert.strictEqual(form.entries[0][0], 'payload{}');
      assert.strictEqual(form.entries[0][1], JSON.stringify({ a: 1 }));
    });
  });
});
