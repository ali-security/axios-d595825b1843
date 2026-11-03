'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var buildFullPath = require('../core/buildFullPath');
var buildURL = require('./../helpers/buildURL');
var http = require('http');
var https = require('https');
var httpFollow = require('follow-redirects').http;
var httpsFollow = require('follow-redirects').https;
var url = require('url');
var path = require('path');
var zlib = require('zlib');
// 0.27.2 binds `stream` to the response stream inside handleResponse, so the
// module is pulled in as its Transform constructor rather than as `stream`.
var Transform = require('stream').Transform;
var VERSION = require('./../env/data').version;
var transitionalDefaults = require('../defaults/transitional');
var AxiosError = require('../core/AxiosError');
var CanceledError = require('../cancel/CanceledError');
var estimateDataURLDecodedBytes = require('../helpers/estimateDataURLDecodedBytes');
var shouldBypassProxy = require('../helpers/shouldBypassProxy');

var isHttps = /https:?/;

var supportedProtocols = [ 'http:', 'https:', 'file:' ];

function getOwn(obj, key) {
  return obj && utils.hasOwnProp(obj, key) ? obj[key] : undefined;
}

/**
 * Windows named pipes are not filesystem paths, so they are compared verbatim;
 * everything else is resolved to an absolute path so `./x.sock`, `x.sock` and
 * `/cwd/x.sock` cannot be played off against each other.
 *
 * @param {String} socketPath
 * @returns {String} The canonical form used for allowlist comparisons
 */
function normalizeSocketPath(socketPath) {
  if (/^\\\\[.?]\\pipe\\/i.test(socketPath)) {
    return socketPath;
  }

  return path.resolve(socketPath);
}

/**
 * @param {Object} config
 * @returns {Array|null|boolean} The allowlist, null when unset, false when invalid
 */
function getAllowedSocketPaths(config) {
  var allowedSocketPaths = getOwn(config, 'allowedSocketPaths');

  if (allowedSocketPaths === null || utils.isUndefined(allowedSocketPaths)) {
    return null;
  }

  if (utils.isString(allowedSocketPaths)) {
    return [allowedSocketPaths];
  }

  if (utils.isArray(allowedSocketPaths)) {
    for (var i = 0; i < allowedSocketPaths.length; i++) {
      if (!utils.isString(allowedSocketPaths[i])) {
        return false;
      }
    }

    return allowedSocketPaths;
  }

  return false;
}

/**
 * Validate `config.socketPath` against `config.allowedSocketPaths` before any
 * connection is attempted, so a request cannot be diverted to an arbitrary UNIX
 * socket (e.g. `/var/run/docker.sock`).
 *
 * @param {Object} config
 * @param {*} socketPath The own-property value of config.socketPath
 * @returns {AxiosError|null} An error to reject with, or null when acceptable
 */
function checkSocketPath(config, socketPath) {
  if (!socketPath) {
    return null;
  }

  if (!utils.isString(socketPath)) {
    return new AxiosError(
      'config.socketPath must be a string',
      AxiosError.ERR_BAD_OPTION_VALUE,
      config
    );
  }

  var allowedSocketPaths = getAllowedSocketPaths(config);

  if (allowedSocketPaths === false) {
    return new AxiosError(
      'config.allowedSocketPaths must be a string, an array of strings, or null',
      AxiosError.ERR_BAD_OPTION_VALUE,
      config
    );
  }

  if (allowedSocketPaths) {
    var normalizedSocketPath = normalizeSocketPath(socketPath);
    var allowed = allowedSocketPaths.some(function isAllowed(allowedSocketPath) {
      return normalizeSocketPath(allowedSocketPath) === normalizedSocketPath;
    });

    if (!allowed) {
      return new AxiosError(
        'config.socketPath is not allowed by config.allowedSocketPaths',
        AxiosError.ERR_BAD_OPTION_VALUE,
        config
      );
    }
  }

  return null;
}

/**
 *
 * @param {http.ClientRequestArgs} options
 * @param {AxiosProxyConfig} proxy
 * @param {string} location
 */
function setProxy(options, proxy, location) {
  // Read the proxy descriptor as own properties only: a polluted
  // `Object.prototype.host` / `.port` / `.auth` would otherwise redirect the
  // request to an attacker-controlled proxy and hand it credentials.
  var proxyHost = getOwn(proxy, 'host');
  var proxyAuth = getOwn(proxy, 'auth');

  options.hostname = proxyHost;
  options.host = proxyHost;
  options.port = getOwn(proxy, 'port');
  options.path = location;

  // Basic proxy authorization
  if (proxyAuth) {
    var proxyUsername = getOwn(proxyAuth, 'username');
    var proxyPassword = getOwn(proxyAuth, 'password');
    var base64 = Buffer.from(proxyUsername + ':' + proxyPassword, 'utf8').toString('base64');
    options.headers['Proxy-Authorization'] = 'Basic ' + base64;
  }

  // If a proxy is used, any redirects must also pass through the proxy
  options.beforeRedirect = function beforeRedirect(redirection) {
    redirection.headers.host = redirection.host;
    setProxy(redirection, proxy, redirection.href);
  };
}

/*eslint consistent-return:0*/
module.exports = function httpAdapter(config) {
  return new Promise(function dispatchHttpRequest(resolvePromise, rejectPromise) {
    var onCanceled;
    function done() {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(onCanceled);
      }

      if (config.signal) {
        config.signal.removeEventListener('abort', onCanceled);
      }
    }
    var resolve = function resolve(value) {
      done();
      resolvePromise(value);
    };
    var rejected = false;
    var reject = function reject(value) {
      done();
      rejected = true;
      rejectPromise(value);
    };
    var data = config.data;
    var headers = config.headers;
    var headerNames = {};

    Object.keys(headers).forEach(function storeLowerName(name) {
      headerNames[name.toLowerCase()] = name;
    });

    // Set User-Agent (required by some servers)
    // See https://github.com/axios/axios/issues/69
    if ('user-agent' in headerNames) {
      // User-Agent is specified; handle case where no UA header is desired
      if (!headers[headerNames['user-agent']]) {
        delete headers[headerNames['user-agent']];
      }
      // Otherwise, use specified value
    } else {
      // Only set header if it hasn't been set in config
      headers['User-Agent'] = 'axios/' + VERSION;
    }

    // support for https://www.npmjs.com/package/form-data api
    if (utils.isFormData(data) && utils.isFunction(data.getHeaders) &&
        data.getHeaders !== Object.prototype.getHeaders) {
      Object.assign(headers, data.getHeaders());
    } else if (data && !utils.isStream(data)) {
      if (Buffer.isBuffer(data)) {
        // Nothing to do...
      } else if (utils.isArrayBuffer(data)) {
        data = Buffer.from(new Uint8Array(data));
      } else if (utils.isString(data)) {
        data = Buffer.from(data, 'utf-8');
      } else {
        return reject(new AxiosError(
          'Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream',
          AxiosError.ERR_BAD_REQUEST,
          config
        ));
      }

      if (config.maxBodyLength > -1 && data.length > config.maxBodyLength) {
        return reject(new AxiosError(
          'Request body larger than maxBodyLength limit',
          AxiosError.ERR_BAD_REQUEST,
          config
        ));
      }

      // Add Content-Length header if data exists
      if (!headerNames['content-length']) {
        headers['Content-Length'] = data.length;
      }
    }

    // HTTP basic authentication
    // Own properties only: a polluted `Object.prototype.auth` (or a polluted
    // `.username` / `.password` on the credentials object) must not be able to
    // inject an Authorization header. See GHSA-q8qp-cvcw-x6jj.
    var auth = undefined;
    var configAuth = getOwn(config, 'auth');
    if (configAuth) {
      var username = getOwn(configAuth, 'username') || '';
      var password = getOwn(configAuth, 'password') || '';
      auth = username + ':' + password;
    }

    // Parse url
    // Own properties only, so a polluted `Object.prototype.baseURL` cannot
    // re-target the request at an attacker controlled origin.
    var fullPath = buildFullPath(
      getOwn(config, 'baseURL'),
      getOwn(config, 'url'),
      getOwn(config, 'allowAbsoluteUrls')
    );
    var parsed = url.parse(fullPath);
    var protocol = parsed.protocol || supportedProtocols[0];

    if (supportedProtocols.indexOf(protocol) === -1) {
      return reject(new AxiosError(
        'Unsupported protocol ' + protocol,
        AxiosError.ERR_BAD_REQUEST,
        config
      ));
    }

    // CVE-2025-58754: Check maxContentLength for data: URLs to prevent unbounded memory allocation
    if (protocol === 'data:') {
      // Apply the same semantics as HTTP: only enforce if a finite, non-negative cap is set.
      if (config.maxContentLength > -1) {
        var dataUrl = String(config.url || fullPath || '');
        var estimated = estimateDataURLDecodedBytes(dataUrl);

        if (estimated > config.maxContentLength) {
          return reject(createError(
            'maxContentLength size of ' + config.maxContentLength + ' exceeded',
            config,
            'ERR_BAD_RESPONSE',
            null
          ));
        }
      }
    }

    if (!auth && parsed.auth) {
      var urlAuth = parsed.auth.split(':');
      var urlUsername = urlAuth[0] || '';
      var urlPassword = urlAuth[1] || '';
      auth = urlUsername + ':' + urlPassword;
    }

    if (auth && headerNames.authorization) {
      delete headers[headerNames.authorization];
    }

    var isHttpsRequest = isHttps.test(protocol);
    var agent = isHttpsRequest ? config.httpsAgent : config.httpAgent;

    try {
      buildURL(parsed.path, config.params, config.paramsSerializer).replace(/^\?/, '');
    } catch (err) {
      var customErr = new Error(err.message);
      customErr.config = config;
      customErr.url = config.url;
      customErr.exists = true;
      reject(customErr);
    }

    // Null-prototype to block prototype pollution gadgets on properties that are
    // read directly off this object by Node's `http.request` (for example
    // `insecureHTTPParser` or `socketPath`). See GHSA-q8qp-cvcw-x6jj.
    var options = Object.assign(Object.create(null), {
      path: buildURL(parsed.path, config.params, config.paramsSerializer).replace(/^\?/, ''),
      method: config.method.toUpperCase(),
      headers: headers,
      agent: agent,
      agents: { http: config.httpAgent, https: config.httpsAgent },
      auth: auth
    });

    // Read as an own property so a polluted `Object.prototype.socketPath`
    // cannot divert the request to an arbitrary UNIX socket.
    var socketPath = getOwn(config, 'socketPath');
    var socketPathError = checkSocketPath(config, socketPath);

    if (socketPathError) {
      return reject(socketPathError);
    }

    // `socketPath` is always written as an own property: both follow-redirects
    // and Node re-spread these options onto fresh `{}` literals, which would
    // otherwise inherit a polluted `Object.prototype.socketPath` and connect to
    // an arbitrary UNIX socket (GHSA-q8qp-cvcw-x6jj).
    options.socketPath = socketPath;

    if (!socketPath) {
      options.hostname = parsed.hostname;
      options.port = parsed.port;
    }

    var proxyLocation = protocol + '//' + parsed.host + options.path;

    // Own property only: a polluted `Object.prototype.proxy` must not be able to
    // route the request through an attacker-controlled proxy.
    var proxy = getOwn(config, 'proxy');
    if (!proxy && proxy !== false) {
      var proxyEnv = protocol.slice(0, -1) + '_proxy';
      var proxyUrl = process.env[proxyEnv] || process.env[proxyEnv.toUpperCase()];
      if (proxyUrl) {
        var parsedProxyUrl = url.parse(proxyUrl);
        var shouldProxy = !shouldBypassProxy(proxyLocation);

        if (shouldProxy) {
          proxy = {
            host: parsedProxyUrl.hostname,
            port: parsedProxyUrl.port,
            protocol: parsedProxyUrl.protocol
          };

          if (parsedProxyUrl.auth) {
            var proxyUrlAuth = parsedProxyUrl.auth.split(':');
            proxy.auth = {
              username: proxyUrlAuth[0],
              password: proxyUrlAuth[1]
            };
          }
        }
      }
    }

    if (proxy) {
      options.headers.host = parsed.hostname + (parsed.port ? ':' + parsed.port : '');
      setProxy(options, proxy, proxyLocation);
    }

    var transport;
    var isHttpsProxy = isHttpsRequest && (proxy ? isHttps.test(getOwn(proxy, 'protocol')) : true);
    var configTransport = getOwn(config, 'transport');
    if (configTransport) {
      transport = configTransport;
    } else if (config.maxRedirects === 0) {
      transport = isHttpsProxy ? https : http;
    } else {
      if (config.maxRedirects) {
        options.maxRedirects = config.maxRedirects;
      }
      // `beforeRedirect` must always end up as an own property of the options
      // object: follow-redirects copies them onto a fresh `{}`, which would
      // otherwise inherit a polluted `Object.prototype.beforeRedirect` and
      // invoke it on every redirect (GHSA-q8qp-cvcw-x6jj). When a proxy is in
      // use `setProxy` has already installed its own hook, which still wins
      // over the prototype and must be preserved.
      var configBeforeRedirect = getOwn(config, 'beforeRedirect');
      if (configBeforeRedirect) {
        options.beforeRedirect = configBeforeRedirect;
      } else if (!utils.hasOwnProp(options, 'beforeRedirect')) {
        options.beforeRedirect = undefined;
      }
      transport = isHttpsProxy ? httpsFollow : httpFollow;
    }

    if (config.maxBodyLength > -1) {
      options.maxBodyLength = config.maxBodyLength;
    }

    // Always set an explicit own value so a polluted
    // `Object.prototype.insecureHTTPParser` cannot enable the lenient parser
    // through Node's internal options copy (GHSA-q8qp-cvcw-x6jj).
    options.insecureHTTPParser = Boolean(getOwn(config, 'insecureHTTPParser'));

    // Create the request
    var req = transport.request(options, function handleResponse(res) {
      if (req.aborted) return;

      // uncompress the response body transparently if required
      var stream = res;

      // return the last request in case of redirects
      var lastRequest = res.req || req;


      // if no content, is HEAD request or decompress disabled we should not decompress
      if (res.statusCode !== 204 && lastRequest.method !== 'HEAD' && config.decompress !== false) {
        switch (res.headers['content-encoding']) {
        /*eslint default-case:0*/
        case 'gzip':
        case 'compress':
        case 'deflate':
        // add the unzipper to the body stream processing pipeline
          stream = stream.pipe(zlib.createUnzip());

          // remove the content-encoding in order to not confuse downstream operations
          delete res.headers['content-encoding'];
          break;
        }
      }

      var response = {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
        config: config,
        request: lastRequest
      };

      if (config.responseType === 'stream') {
        // Enforce maxContentLength on streamed responses too (GHSA-vf2m-468p-8v99).
        // Previously the stream path bypassed the size guard because the check only
        // ran on the buffering branch.
        if (config.maxContentLength > -1) {
          var maxContentLength = config.maxContentLength;
          var streamedBytes = 0;
          var limiter = new Transform({
            transform: function transformChunk(chunk, encoding, callback) {
              streamedBytes += chunk.length;
              if (streamedBytes > maxContentLength) {
                callback(new AxiosError(
                  'maxContentLength size of ' + maxContentLength + ' exceeded',
                  AxiosError.ERR_BAD_RESPONSE,
                  config,
                  lastRequest
                ));
                return;
              }
              callback(null, chunk);
            }
          });
          limiter.on('error', function handleLimiterError() {
            rejected = true;
            stream.destroy();
          });
          stream.on('error', function forwardError(err) {
            limiter.destroy(err);
          });
          response.data = limiter;
          settle(resolve, reject, response);
          // Defer piping via setImmediate so the caller's `.then` (a microtask)
          // has run and attached any `error`/`data` listeners before chunks flow
          // through the transform. `process.nextTick` would drain before those
          // microtasks and lose the error event.
          setImmediate(function startPipe() {
            stream.pipe(limiter);
          });
        } else {
          response.data = stream;
          settle(resolve, reject, response);
        }
      } else {
        var responseBuffer = [];
        var totalResponseBytes = 0;
        stream.on('data', function handleStreamData(chunk) {
          responseBuffer.push(chunk);
          totalResponseBytes += chunk.length;

          // make sure the content length is not over the maxContentLength if specified
          if (config.maxContentLength > -1 && totalResponseBytes > config.maxContentLength) {
            // stream.destoy() emit aborted event before calling reject() on Node.js v16
            rejected = true;
            stream.destroy();
            reject(new AxiosError('maxContentLength size of ' + config.maxContentLength + ' exceeded',
              AxiosError.ERR_BAD_RESPONSE, config, lastRequest));
          }
        });

        stream.on('aborted', function handlerStreamAborted() {
          if (rejected) {
            return;
          }
          stream.destroy();
          reject(new AxiosError(
            'maxContentLength size of ' + config.maxContentLength + ' exceeded',
            AxiosError.ERR_BAD_RESPONSE,
            config,
            lastRequest
          ));
        });

        stream.on('error', function handleStreamError(err) {
          if (req.aborted) return;
          reject(AxiosError.from(err, null, config, lastRequest));
        });

        stream.on('end', function handleStreamEnd() {
          try {
            var responseData = responseBuffer.length === 1 ? responseBuffer[0] : Buffer.concat(responseBuffer);
            if (config.responseType !== 'arraybuffer') {
              responseData = responseData.toString(config.responseEncoding);
              if (!config.responseEncoding || config.responseEncoding === 'utf8') {
                responseData = utils.stripBOM(responseData);
              }
            }
            response.data = responseData;
          } catch (err) {
            reject(AxiosError.from(err, null, config, response.request, response));
          }
          settle(resolve, reject, response);
        });
      }
    });

    // Handle errors
    req.on('error', function handleRequestError(err) {
      // @todo remove
      // if (req.aborted && err.code !== AxiosError.ERR_FR_TOO_MANY_REDIRECTS) return;
      reject(AxiosError.from(err, null, config, req));
    });

    // set tcp keep alive to prevent drop connection by peer
    req.on('socket', function handleRequestSocket(socket) {
      // default interval of sending ack packet is 1 minute
      socket.setKeepAlive(true, 1000 * 60);
    });

    // Handle request timeout
    if (config.timeout) {
      // This is forcing a int timeout to avoid problems if the `req` interface doesn't handle other types.
      var timeout = parseInt(config.timeout, 10);

      if (isNaN(timeout)) {
        reject(new AxiosError(
          'error trying to parse `config.timeout` to int',
          AxiosError.ERR_BAD_OPTION_VALUE,
          config,
          req
        ));

        return;
      }

      // Sometime, the response will be very slow, and does not respond, the connect event will be block by event loop system.
      // And timer callback will be fired, and abort() will be invoked before connection, then get "socket hang up" and code ECONNRESET.
      // At this time, if we have a large number of request, nodejs will hang up some socket on background. and the number will up and up.
      // And then these socket which be hang up will devoring CPU little by little.
      // ClientRequest.setTimeout will be fired on the specify milliseconds, and can make sure that abort() will be fired after connect.
      req.setTimeout(timeout, function handleRequestTimeout() {
        req.abort();
        var transitional = config.transitional || transitionalDefaults;
        reject(new AxiosError(
          'timeout of ' + timeout + 'ms exceeded',
          transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
          config,
          req
        ));
      });
    }

    if (config.cancelToken || config.signal) {
      // Handle cancellation
      // eslint-disable-next-line func-names
      onCanceled = function(cancel) {
        if (req.aborted) return;

        req.abort();
        reject(!cancel || (cancel && cancel.type) ? new CanceledError() : cancel);
      };

      config.cancelToken && config.cancelToken.subscribe(onCanceled);
      if (config.signal) {
        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
      }
    }


    // Send the request
    if (utils.isStream(data)) {
      data.on('error', function handleStreamError(err) {
        reject(AxiosError.from(err, config, null, req));
      });

      // follow-redirects enforces options.maxBodyLength for stream uploads, but the
      // native http/https transport (used when maxRedirects === 0) does not.
      // Count bytes ourselves so the limit is always honored (GHSA-5c9x-8gcm-mpgx).
      var nativeTransport = transport === http || transport === https;
      if (nativeTransport && config.maxBodyLength > -1) {
        var maxBodyLength = config.maxBodyLength;
        var uploadedBytes = 0;
        var bodyLimiter = new Transform({
          transform: function transformChunk(chunk, encoding, callback) {
            uploadedBytes += chunk.length;
            if (uploadedBytes > maxBodyLength) {
              callback(new AxiosError(
                'Request body larger than maxBodyLength limit',
                AxiosError.ERR_BAD_REQUEST,
                config,
                req
              ));
              return;
            }
            callback(null, chunk);
          }
        });
        bodyLimiter.on('error', function handleLimiterError(err) {
          if (rejected) return;
          rejected = true;
          try { data.unpipe(bodyLimiter); } catch (e) { /* noop */ }
          try { bodyLimiter.unpipe(req); } catch (e) { /* noop */ }
          req.destroy();
          reject(err);
        });
        data.pipe(bodyLimiter).pipe(req);
      } else {
        data.pipe(req);
      }
    } else {
      req.end(data);
    }
  });
};
