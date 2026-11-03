'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');
var CanceledError = require('../cancel/CanceledError');
var sanitizeHeaderValue = require('../helpers/sanitizeHeaderValue');

/**
 * Throws a `CanceledError` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new CanceledError();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist. A request interceptor may return a replacement config
  // that inherits from Object.prototype, so only an own headers value is used.
  config.headers = (utils.hasOwnProp(config, 'headers') && config.headers) || {};

  // Transform request data
  config.data = transformData.call(
    config,
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  // The `common` / per-method buckets must be read as own properties only:
  // reading them through the prototype chain let a polluted
  // `Object.prototype.common` (or `.get`, `.post`, ...) inject headers into
  // every outgoing request.
  var commonHeaders = utils.hasOwnProp(config.headers, 'common') && config.headers.common
    ? config.headers.common
    : {};
  var methodHeaders = config.method &&
    utils.hasOwnProp(config.headers, config.method) &&
    config.headers[config.method]
    ? config.headers[config.method]
    : {};

  config.headers = utils.merge(commonHeaders, methodHeaders, config.headers);

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  utils.forEach(config.headers, function sanitizeHeaderConfigValue(value, header) {
    config.headers[header] = sanitizeHeaderValue(value);
  });

  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData.call(
      config,
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};
