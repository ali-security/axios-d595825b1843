var assert = require('assert');
var shouldBypassProxy = require('../../../lib/helpers/shouldBypassProxy');

var originalNoProxy = process.env.no_proxy;
var originalNOProxy = process.env.NO_PROXY;

function setNoProxy(value) {
  process.env.no_proxy = value;
  process.env.NO_PROXY = value;
}

describe('helpers::shouldBypassProxy', function () {
  afterEach(function () {
    if (originalNoProxy === undefined) {
      delete process.env.no_proxy;
    } else {
      process.env.no_proxy = originalNoProxy;
    }

    if (originalNOProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = originalNOProxy;
    }
  });

  it('should bypass proxy for localhost with a trailing dot', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://localhost.:8080/'), true);
  });

  it('should bypass proxy for bracketed ipv6 loopback', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);
  });

  it('should support bracketed ipv6 entries in no_proxy', function () {
    setNoProxy('[::1]');
    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);
  });

  it('should match wildcard and explicit ports', function () {
    setNoProxy('*.example.com,localhost:8080');

    assert.strictEqual(shouldBypassProxy('http://api.example.com/'), true);
    assert.strictEqual(shouldBypassProxy('http://localhost:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://localhost:8081/'), false);
  });

  it('should treat localhost and loopback IP aliases as equivalent', function () {
    setNoProxy('localhost');

    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);

    setNoProxy('127.0.0.1');

    assert.strictEqual(shouldBypassProxy('http://localhost:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);

    setNoProxy('::1');

    assert.strictEqual(shouldBypassProxy('http://localhost:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
  });

  it('should keep loopback alias matching port-aware', function () {
    setNoProxy('localhost:8080');

    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8081/'), false);
  });

  it('should treat 0.0.0.0 as a local address for no_proxy matching', function () {
    setNoProxy('localhost,127.0.0.1,::1');

    assert.strictEqual(shouldBypassProxy('http://0.0.0.0:8080/'), true);
  });

  it('should keep 0.0.0.0 no_proxy matching port-aware', function () {
    setNoProxy('localhost:8080');

    assert.strictEqual(shouldBypassProxy('http://0.0.0.0:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://0.0.0.0:8081/'), false);
  });

  it('should bypass proxy for IPv4-mapped IPv6 loopback when IPv4 is listed', function () {
    setNoProxy('127.0.0.1');

    assert.strictEqual(shouldBypassProxy('http://[::ffff:127.0.0.1]/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::ffff:7f00:1]/'), true);
  });

  it('should bypass proxy for IPv4-mapped IPv6 metadata address when IPv4 is listed', function () {
    setNoProxy('169.254.169.254');

    assert.strictEqual(shouldBypassProxy('http://[::ffff:a9fe:a9fe]/latest/meta-data/'), true);
  });

  it('should support IPv4-mapped IPv6 entries in no_proxy', function () {
    setNoProxy('[::ffff:7f00:1]');

    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::ffff:127.0.0.1]:8080/'), true);
  });

  it('should keep IPv4-mapped IPv6 no_proxy entries port-aware', function () {
    setNoProxy('[::ffff:7f00:1]:8080');

    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::ffff:7f00:1]:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::ffff:7f00:1]:8081/'), false);
  });

  it('should normalise IPv4-mapped IPv6 no_proxy entries regardless of hex case', function () {
    setNoProxy('[::FFFF:7F00:1]');

    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://[::ffff:7f00:1]:8080/'), true);
  });

  // IPv4-mapped IPv6 normalization: an attacker (or naive caller) can use the
  // IPv4-mapped IPv6 representation of an address (e.g. ::ffff:192.168.1.5)
  // to dodge a no_proxy policy expressed in IPv4 form, or vice-versa. After
  // canonicalising both sides, equivalent addresses compare equal.
  describe('IPv4-mapped IPv6 normalization', function () {
    it('should bypass via IPv4-mapped IPv6 request when no_proxy uses the IPv4 form', function () {
      setNoProxy('192.168.1.5');

      assert.strictEqual(shouldBypassProxy('http://[::ffff:192.168.1.5]/'), true);
    });

    it('should bypass via Node-normalised IPv4-mapped hex request against an IPv4 no_proxy', function () {
      // Node's URL parser canonicalises [::ffff:192.168.1.5] to [::ffff:c0a8:105].
      // The hex form must unmap to 192.168.1.5 to match the entry.
      setNoProxy('192.168.1.5');

      assert.strictEqual(shouldBypassProxy('http://[::ffff:c0a8:105]/'), true);
    });

    it('should bypass via plain IPv4 request when no_proxy uses the IPv4-mapped IPv6 dotted form', function () {
      setNoProxy('::ffff:192.168.1.5');

      assert.strictEqual(shouldBypassProxy('http://192.168.1.5/'), true);
    });

    it('should bypass via plain IPv4 request when no_proxy uses the IPv4-mapped IPv6 hex form', function () {
      setNoProxy('::ffff:a00:1');

      assert.strictEqual(shouldBypassProxy('http://10.0.0.1/'), true);
    });

    it('should bypass via plain IPv4 request when no_proxy uses a bracketed IPv4-mapped IPv6 entry', function () {
      setNoProxy('[::ffff:192.168.1.5]');

      assert.strictEqual(shouldBypassProxy('http://192.168.1.5/'), true);
    });

    it('should treat the uncompressed 0:0:0:0:0:ffff:<v4> form as equivalent', function () {
      setNoProxy('0:0:0:0:0:ffff:10.0.0.1');

      assert.strictEqual(shouldBypassProxy('http://10.0.0.1/'), true);
      assert.strictEqual(shouldBypassProxy('http://[::ffff:10.0.0.1]/'), true);
    });

    it('should treat compressed zero-prefix IPv4-mapped IPv6 dotted forms as equivalent', function () {
      var entries = [
        '0::ffff:192.168.1.5',
        '0:0::ffff:192.168.1.5',
        '0:0:0::ffff:192.168.1.5',
        '0:0:0:0::ffff:192.168.1.5'
      ];

      for (var i = 0; i < entries.length; i++) {
        setNoProxy(entries[i]);

        assert.strictEqual(shouldBypassProxy('http://192.168.1.5/'), true, entries[i]);
      }
    });

    it('should treat compressed zero-prefix IPv4-mapped IPv6 hex forms as equivalent', function () {
      var entries = [
        '0::ffff:c0a8:105',
        '0:0::ffff:c0a8:105',
        '0:0:0::ffff:c0a8:105',
        '0:0:0:0::ffff:c0a8:105'
      ];

      for (var i = 0; i < entries.length; i++) {
        setNoProxy(entries[i]);

        assert.strictEqual(shouldBypassProxy('http://192.168.1.5/'), true, entries[i]);
      }
    });

    it('should support compressed bracketed IPv4-mapped IPv6 entries with explicit ports', function () {
      setNoProxy('[0:0::ffff:192.168.1.5]:8080');

      assert.strictEqual(shouldBypassProxy('http://192.168.1.5:8080/'), true);
      assert.strictEqual(shouldBypassProxy('http://192.168.1.5:9090/'), false);
    });

    it('should NOT cross-match unrelated addresses', function () {
      setNoProxy('192.168.1.5');

      // Different IPv4 address inside an IPv4-mapped form must not bypass.
      assert.strictEqual(shouldBypassProxy('http://[::ffff:192.168.1.6]/'), false);
      // Non-mapped IPv6 must not be treated as IPv4.
      assert.strictEqual(shouldBypassProxy('http://[2001:db8::1]/'), false);
    });

    it('should leave non-mapped IPv6 addresses comparing as IPv6', function () {
      setNoProxy('2001:db8::1');

      assert.strictEqual(shouldBypassProxy('http://[2001:db8::1]/'), true);
      assert.strictEqual(shouldBypassProxy('http://[2001:db8::2]/'), false);
    });
  });
});
