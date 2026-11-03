'use strict';

var URL = require('url').URL;

var DEFAULT_PORTS = {
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
  ftp: 21
};

function parseNoProxyEntry(entry) {
  var entryHost = entry;
  var entryPort = 0;

  if (entryHost.charAt(0) === '[') {
    var bracketIndex = entryHost.indexOf(']');

    if (bracketIndex !== -1) {
      var host = entryHost.slice(1, bracketIndex);
      var rest = entryHost.slice(bracketIndex + 1);

      if (rest.charAt(0) === ':' && /^\d+$/.test(rest.slice(1))) {
        entryPort = parseInt(rest.slice(1), 10);
      }

      return [host, entryPort];
    }
  }

  var firstColon = entryHost.indexOf(':');
  var lastColon = entryHost.lastIndexOf(':');

  if (firstColon !== -1 && firstColon === lastColon && /^\d+$/.test(entryHost.slice(lastColon + 1))) {
    entryPort = parseInt(entryHost.slice(lastColon + 1), 10);
    entryHost = entryHost.slice(0, lastColon);
  }

  return [entryHost, entryPort];
}

function parseIPv4Octets(hostname) {
  var octets = hostname.split('.');

  if (octets.length !== 4) {
    return null;
  }

  for (var i = 0; i < octets.length; i++) {
    if (!/^\d+$/.test(octets[i]) || Number(octets[i]) > 255) {
      return null;
    }
  }

  return octets;
}

// Recognises IPv4-mapped IPv6 addresses (the ::ffff:0:0/96 prefix) in every
// spelling of the leading zero run, so both sides of a no_proxy comparison are
// canonicalised to the same IPv4 dotted form:
//   ::ffff:127.0.0.1            (compressed prefix, dotted-quad tail)
//   ::ffff:7f00:1               (compressed prefix, two-group hex tail)
//   0:0:0:0:0:ffff:127.0.0.1    (fully expanded prefix)
//   0::ffff:7f00:1              (partially compressed prefix)
// Without this, `no_proxy=192.168.1.5` would not match a request to
// `http://[::ffff:192.168.1.5]/` (and vice-versa), letting the alternate
// representation circumvent the proxy-bypass policy. Single-group tails like
// ::ffff:1 are still not normalised.
var IPV4_MAPPED_DOTTED_RE = /^(?:::|(?:0{1,4}:){1,4}:|(?:0{1,4}:){5})ffff:(\d+\.\d+\.\d+\.\d+)$/i;
var IPV4_MAPPED_HEX_RE = /^(?:::|(?:0{1,4}:){1,4}:|(?:0{1,4}:){5})ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

function normalizeIPv4MappedIPv6(hostname) {
  // Match against the lowercased form so a hand-crafted no_proxy entry like
  // `[::FFFF:7F00:1]` still resolves to its IPv4 alias. Callers that route via
  // URL parsing already lowercase, but the helper stays robust on its own.
  var lower = hostname.toLowerCase();
  var dottedMatch = IPV4_MAPPED_DOTTED_RE.exec(lower);

  if (dottedMatch) {
    var octets = parseIPv4Octets(dottedMatch[1]);
    return octets ? octets.join('.') : hostname;
  }

  var hexMatch = IPV4_MAPPED_HEX_RE.exec(lower);

  if (hexMatch) {
    var high = parseInt(hexMatch[1], 16);
    var low = parseInt(hexMatch[2], 16);

    return [
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 8) & 0xff,
      low & 0xff
    ].join('.');
  }

  return hostname;
}

function normalizeNoProxyHost(host) {
  var hostname = host;

  if (!hostname) {
    return hostname;
  }

  if (hostname.charAt(0) === '[' && hostname.charAt(hostname.length - 1) === ']') {
    hostname = hostname.slice(1, -1);
  }

  hostname = hostname.replace(/\.+$/, '');

  return normalizeIPv4MappedIPv6(hostname);
}

function isLoopbackIPv4(hostname) {
  var octets = hostname.split('.');

  if (octets.length !== 4) {
    return false;
  }

  if (octets[0] !== '127') {
    return false;
  }

  return octets.every(function testOctet(octet) {
    return /^\d+$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255;
  });
}

function isLoopbackHost(hostname) {
  // `0.0.0.0` resolves to the local host on every platform axios supports, so a
  // no_proxy entry of `localhost` (or `127.0.0.1`) must bypass the proxy for it
  // too - otherwise a local-only request is silently routed through the proxy.
  return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' ||
    isLoopbackIPv4(hostname);
}

module.exports = function shouldBypassProxy(location) {
  var parsed;

  try {
    parsed = new URL(location);
  } catch (err) {
    return false;
  }

  var noProxy = (process.env.no_proxy || process.env.NO_PROXY || '').toLowerCase();

  if (!noProxy) {
    return false;
  }

  if (noProxy === '*') {
    return true;
  }

  var protocol = parsed.protocol.split(':', 1)[0];
  var port = parsed.port !== '' ? parseInt(parsed.port, 10) : (DEFAULT_PORTS[protocol] || 0);
  var hostname = normalizeNoProxyHost(parsed.hostname.toLowerCase());

  return noProxy.split(/[\s,]+/).some(function testNoProxyEntry(entry) {
    if (!entry) {
      return false;
    }

    var entryParts = parseNoProxyEntry(entry);
    var entryHost = normalizeNoProxyHost(entryParts[0]);
    var entryPort = entryParts[1];

    if (entryHost === '*') {
      return true;
    }

    if (!entryHost) {
      return false;
    }

    if (entryPort && entryPort !== port) {
      return false;
    }

    if (isLoopbackHost(hostname) && isLoopbackHost(entryHost)) {
      return true;
    }

    if (entryHost.charAt(0) === '*') {
      entryHost = entryHost.slice(1);
    }

    if (entryHost.charAt(0) === '.') {
      return hostname.slice(-entryHost.length) === entryHost;
    }

    return hostname === entryHost;
  });
};
