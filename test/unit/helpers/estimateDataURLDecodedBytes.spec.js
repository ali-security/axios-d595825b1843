var assert = require('assert');
var estimateDataURLDecodedBytes = require('../../../lib/helpers/estimateDataURLDecodedBytes');

describe('estimateDataURLDecodedBytes', function() {
  it('should return 0 for non-data URLs', function() {
    assert.strictEqual(estimateDataURLDecodedBytes('http://example.com'), 0);
  });

  it('should calculate length for simple non-base64 data URL', function() {
    var url = 'data:,Hello';
    assert.strictEqual(estimateDataURLDecodedBytes(url), Buffer.byteLength('Hello', 'utf8'));
  });

  it('should calculate decoded length for base64 data URL', function() {
    var str = 'Hello';
    var b64 = Buffer.from(str, 'utf8').toString('base64');
    var url = 'data:text/plain;base64,' + b64;
    assert.strictEqual(estimateDataURLDecodedBytes(url), str.length);
  });

  it('should handle base64 with = padding', function() {
    var url = 'data:text/plain;base64,TQ=='; // "M"
    assert.strictEqual(estimateDataURLDecodedBytes(url), 1);
  });

  it('should handle base64 with %3D padding', function() {
    var url = 'data:text/plain;base64,TQ%3D%3D'; // "M"
    assert.strictEqual(estimateDataURLDecodedBytes(url), 1);
  });
});
