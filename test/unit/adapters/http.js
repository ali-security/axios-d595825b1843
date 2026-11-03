var axios = require('../../../index');
var http = require('http');
var https = require('https');
var net = require('net');
// Pre-load `dns` so it isn't lazy-required from inside an http request after a
// test has polluted `Object.prototype.get` - on older Node versions the lazy
// `Object.defineProperty` call in dns.js inherits the polluted getter and
// throws "Getter must be a function".
require('dns');
var url = require('url');
var zlib = require('zlib');
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var pkg = require('./../../../package.json');
var server, proxy;
var AxiosError = require('../../../lib/core/AxiosError');
var FormData = require('form-data');
var formidable = require('formidable');

describe('supports http with nodejs', function () {

  function clearPrototypePollution() {
    delete Object.prototype.auth;
    delete Object.prototype.username;
    delete Object.prototype.password;
    delete Object.prototype.proxy;
    delete Object.prototype.socketPath;
    delete Object.prototype.allowedSocketPaths;
    delete Object.prototype.transport;
    delete Object.prototype.baseURL;
    delete Object.prototype.url;
    delete Object.prototype.allowAbsoluteUrls;
    delete Object.prototype.beforeRedirect;
    delete Object.prototype.config;
    delete Object.prototype.insecureHTTPParser;
    delete Object.prototype.httpAgent;
    delete Object.prototype.httpsAgent;
    delete Object.prototype.adapter;
    delete Object.prototype.params;
    delete Object.prototype.paramsSerializer;
    delete Object.prototype.method;
    delete Object.prototype.data;
    delete Object.prototype.headers;
    delete Object.prototype.decompress;
    delete Object.prototype.responseType;
    delete Object.prototype.maxRedirects;
    delete Object.prototype.maxContentLength;
    delete Object.prototype.maxBodyLength;
    delete Object.prototype.timeout;
    delete Object.prototype.timeoutErrorMessage;
    delete Object.prototype.transitional;
    delete Object.prototype.transformRequest;
    delete Object.prototype.transformResponse;
    delete Object.prototype.validateStatus;
    delete Object.prototype.env;
    delete Object.prototype.polluted;
    delete Object.prototype.common;
    delete Object.prototype.get;
    delete Object.prototype.post;
    delete Object.prototype.set;
    delete Object.prototype.serialize;
    delete Object.prototype.encode;
  }

  // Defensive: clear before each test in case another suite left pollution.
  beforeEach(clearPrototypePollution);

  afterEach(function () {
    if (server) {
      server.close();
      server = null;
    }
    if (proxy) {
      proxy.close();
      proxy = null;
    }
    if (process.env.http_proxy) {
      delete process.env.http_proxy;
    }
    if (process.env.HTTP_PROXY) {
      delete process.env.HTTP_PROXY;
    }
    if (process.env.https_proxy) {
      delete process.env.https_proxy;
    }
    if (process.env.no_proxy) {
      delete process.env.no_proxy;
    }
    if (process.env.NO_PROXY) {
      delete process.env.NO_PROXY;
    }
    clearPrototypePollution();
  });

  it('should sanitize request headers containing invalid characters', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end(req.headers['x-test']);
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        headers: {
          'x-test': ' ok\r\nInjected: yes\t'
        }
      }).then(function (response) {
        assert.equal(response.data, 'okInjected: yes');
        done();
      }).catch(done);
    });
  });

  it('should preserve request error for unavailable host with invalid characters', function (done) {
    axios.get('http://localhost:1/', {
      headers: {
        'x-test': 'ok\r\nInjected: yes'
      }
    }).then(function () {
      done(new Error('request should not succeed'));
    }).catch(function (error) {
      assert.notEqual(error.message, 'Invalid character in header content ["x-test"]');
      done();
    });
  });

  it('should throw an error if the timeout property is not parsable as a number', function (done) {

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      var success = false, failure = false;
      var error;

      axios.get('http://localhost:4444/', {
        timeout: { strangeTimeout: 250 }
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.code, AxiosError.ERR_BAD_OPTION_VALUE);
        assert.equal(error.message, 'error trying to parse `config.timeout` to int');
        done();
      }, 300);
    });
  });

  it('should parse the timeout property', function (done) {

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      var success = false, failure = false;
      var error;

      axios.get('http://localhost:4444/', {
        timeout: '250'
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.code, 'ECONNABORTED');
        assert.equal(error.message, 'timeout of 250ms exceeded');
        done();
      }, 300);
    });
  });

  it('should respect the timeout property', function (done) {

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      var success = false, failure = false;
      var error;

      axios.get('http://localhost:4444/', {
        timeout: 250
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.code, 'ECONNABORTED');
        assert.equal(error.message, 'timeout of 250ms exceeded');
        done();
      }, 300);
    });
  });

  it('should respect the timeoutErrorMessage property', function (done) {

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      var success = false, failure = false;
      var error;

      axios.get('http://localhost:4444/', {
        timeout: 250,
        timeoutErrorMessage: 'oops, timeout',
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.strictEqual(success, false, 'request should not succeed');
        assert.strictEqual(failure, true, 'request should fail');
        assert.strictEqual(error.code, 'ECONNABORTED');
        assert.strictEqual(error.message, 'timeout of 250ms exceeded');
        done();
      }, 300);
    });
  });

  it('should allow passing JSON', function (done) {
    var data = {
      firstName: 'Fred',
      lastName: 'Flintstone',
      emailAddr: 'fred@example.com'
    };

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    }).listen(4444, function () {
      axios.get('http://localhost:4444/').then(function (res) {
        assert.deepEqual(res.data, data);
        done();
      });
    });
  });

  it('should allow passing JSON with BOM', function (done) {
    var data = {
      firstName: 'Fred',
      lastName: 'Flintstone',
      emailAddr: 'fred@example.com'
    };

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'application/json');
      var bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF])
      var jsonBuffer = Buffer.from(JSON.stringify(data));
      res.end(Buffer.concat([bomBuffer, jsonBuffer]));
    }).listen(4444, function () {
      axios.get('http://localhost:4444/').then(function (res) {
        assert.deepEqual(res.data, data);
        done();
      });
    });
  });

  it('should redirect', function (done) {
    var str = 'test response';

    server = http.createServer(function (req, res) {
      var parsed = url.parse(req.url);

      if (parsed.pathname === '/one') {
        res.setHeader('Location', '/two');
        res.statusCode = 302;
        res.end();
      } else {
        res.end(str);
      }
    }).listen(4444, function () {
      axios.get('http://localhost:4444/one').then(function (res) {
        assert.equal(res.data, str);
        assert.equal(res.request.path, '/two');
        done();
      });
    });
  });

  it('should not redirect', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Location', '/foo');
      res.statusCode = 302;
      res.end();
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        maxRedirects: 0,
        validateStatus: function () {
          return true;
        }
      }).then(function (res) {
        assert.equal(res.status, 302);
        assert.equal(res.headers['location'], '/foo');
        done();
      });
    });
  });

  it('should support max redirects', function (done) {
    var i = 1;
    server = http.createServer(function (req, res) {
      res.setHeader('Location', '/' + i);
      res.statusCode = 302;
      res.end();
      i++;
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        maxRedirects: 3
      }).catch(function (error) {
        assert.equal(error.code, AxiosError.ERR_FR_TOO_MANY_REDIRECTS);
        assert.equal(error.message, 'Maximum number of redirects exceeded');
        done();
      });
    });
  });

  it('should support beforeRedirect', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Location', '/foo');
      res.statusCode = 302;
      res.end();
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        maxRedirects: 3,
        beforeRedirect: function (options) {
          if (options.path === '/foo') {
            throw new Error(
              'Provided path is not allowed'
            );
          }
        }
      }).catch(function (error) {
        assert.equal(error.message, 'Provided path is not allowed');
        done();
      });
    });
  });

  it('should preserve the HTTP verb on redirect', function (done) {
    server = http.createServer(function (req, res) {
      if (req.method.toLowerCase() !== "head") {
        res.statusCode = 400;
        res.end();
        return;
      }

      var parsed = url.parse(req.url);
      if (parsed.pathname === '/one') {
        res.setHeader('Location', '/two');
        res.statusCode = 302;
        res.end();
      } else {
        res.end();
      }
    }).listen(4444, function () {
      axios.head('http://localhost:4444/one').then(function (res) {
        assert.equal(res.status, 200);
        done();
      }).catch(function (err) {
        done(err);
      });
    });
  });

  it('should support transparent gunzip', function (done) {
    var data = {
      firstName: 'Fred',
      lastName: 'Flintstone',
      emailAddr: 'fred@example.com'
    };

    zlib.gzip(JSON.stringify(data), function (err, zipped) {

      server = http.createServer(function (req, res) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Encoding', 'gzip');
        res.end(zipped);
      }).listen(4444, function () {
        axios.get('http://localhost:4444/').then(function (res) {
          assert.deepEqual(res.data, data);
          done();
        });
      });

    });
  });

  it('should support gunzip error handling', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Encoding', 'gzip');
      res.end('invalid response');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/').catch(function (error) {
        done();
      });
    });
  });

  it('should support disabling automatic decompression of response data', function(done) {
    var data = 'Test data';

    zlib.gzip(data, function(err, zipped) {
      server = http.createServer(function(req, res) {
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.end(zipped);
      }).listen(4444, function() {
        axios.get('http://localhost:4444/', {
          decompress: false,
          responseType: 'arraybuffer'

        }).then(function(res) {
          assert.equal(res.data.toString('base64'), zipped.toString('base64'));
          done();
        });
      });
    });
  });

  it('should support UTF8', function (done) {
    var str = Array(100000).join('ж');

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end(str);
    }).listen(4444, function () {
      axios.get('http://localhost:4444/').then(function (res) {
        assert.equal(res.data, str);
        done();
      });
    });
  });

  it('should support basic auth', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers.authorization);
    }).listen(4444, function () {
      var user = 'foo';
      var headers = { Authorization: 'Bearer 1234' };
      axios.get('http://' + user + '@localhost:4444/', { headers: headers }).then(function (res) {
        var base64 = Buffer.from(user + ':', 'utf8').toString('base64');
        assert.equal(res.data, 'Basic ' + base64);
        done();
      });
    });
  });

  it('should support basic auth with a header', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers.authorization);
    }).listen(4444, function () {
      var auth = { username: 'foo', password: 'bar' };
      var headers = { AuThOrIzAtIoN: 'Bearer 1234' }; // wonky casing to ensure caseless comparison
      axios.get('http://localhost:4444/', { auth: auth, headers: headers }).then(function (res) {
        var base64 = Buffer.from('foo:bar', 'utf8').toString('base64');
        assert.equal(res.data, 'Basic ' + base64);
        done();
      });
    });
  });

  it('should normalize nullish own basic auth credentials to empty strings', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers.authorization);
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        auth: {
          username: undefined,
          password: null
        }
      }).then(function (res) {
        assert.equal(res.data, 'Basic ' + Buffer.from(':', 'utf8').toString('base64'));
        done();
      }).catch(done);
    });
  });

  // A request interceptor that clones the config onto a plain `{}` reintroduces
  // the prototype chain, so `config.auth` / `auth.username` / `auth.password`
  // have to be read as own properties or the polluted values are sent as
  // credentials to the server.
  it('should not use inherited basic auth credentials after config cloning', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers.authorization || '');
    }).listen(4444, function () {
      Object.prototype.username = 'polluted-user';
      Object.prototype.password = 'polluted-pass';

      var instance = axios.create();
      var polluted = 'Basic ' + Buffer.from('polluted-user:polluted-pass', 'utf8').toString('base64');

      instance.interceptors.request.use(function (config) {
        var clone = Object.assign({}, config);
        clone.auth = {};
        return clone;
      });

      instance.get('http://localhost:4444/').then(function (res) {
        clearPrototypePollution();
        assert.notStrictEqual(res.data, polluted);
        assert.equal(res.data, 'Basic ' + Buffer.from(':', 'utf8').toString('base64'));
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should provides a default User-Agent header', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers['user-agent']);
    }).listen(4444, function () {
      axios.get('http://localhost:4444/').then(function (res) {
        assert.ok(/^axios\/[\d.]+$/.test(res.data), `User-Agent header does not match: ${res.data}`);
        done();
      });
    });
  });

  it('should allow the User-Agent header to be overridden', function (done) {
    server = http.createServer(function (req, res) {
      res.end(req.headers['user-agent']);
    }).listen(4444, function () {
      var headers = { 'UsEr-AgEnT': 'foo bar' }; // wonky casing to ensure caseless comparison
      axios.get('http://localhost:4444/', { headers }).then(function (res) {
        assert.equal(res.data, 'foo bar');
        done();
      });
    });
  });

  it('should allow the Content-Length header to be overridden', function (done) {
    server = http.createServer(function (req, res) {
      assert.strictEqual(req.headers['content-length'], '42');
      res.end();
    }).listen(4444, function () {
      var headers = { 'CoNtEnT-lEnGtH': '42' }; // wonky casing to ensure caseless comparison
      axios.post('http://localhost:4444/', 'foo', { headers }).then(function () {
        done();
      });
    });
  });

  it('should support max content length', function (done) {
    var str = Array(100000).join('ж');

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end(str);
    }).listen(4444, function () {
      var success = false, failure = false, error;

      axios.get('http://localhost:4444/', {
        maxContentLength: 2000
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.message, 'maxContentLength size of 2000 exceeded');
        done();
      }, 100);
    });
  });

  it('should support max content length for redirected', function (done) {
    var str = Array(100000).join('ж');

    server = http.createServer(function (req, res) {
      var parsed = url.parse(req.url);

      if (parsed.pathname === '/two') {
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.end(str);
      } else {
        res.setHeader('Location', '/two');
        res.statusCode = 302;
        res.end();
      }
    }).listen(4444, function () {
      var success = false, failure = false, error;

      axios.get('http://localhost:4444/one', {
        maxContentLength: 2000
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.message, 'maxContentLength size of 2000 exceeded');
        done();
      }, 100);
    });
  });

  it('should support max body length', function (done) {
    var data = Array(100000).join('ж');

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end();
    }).listen(4444, function () {
      var success = false, failure = false, error;

      axios.post('http://localhost:4444/', {
        data: data
      }, {
        maxBodyLength: 2000
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      });


      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.message, 'Request body larger than maxBodyLength limit');
        done();
      }, 100);
    });
  });

  it('should display error while parsing params', function (done) {
    server = http.createServer(function () {

    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        params: {
          errorParam: new Date(undefined),
        },
      }).catch(function (err) {
        assert.deepEqual(err.exists, true)
        done();
      });
    });
  });

  it('should support sockets', function (done) {
    // Different sockets for win32 vs darwin/linux
    var socketName = './test.sock';

    if (process.platform === 'win32') {
      socketName = '\\\\.\\pipe\\libuv-test';
    }

    server = net.createServer(function (socket) {
      socket.on('data', function () {
        socket.end('HTTP/1.1 200 OK\r\n\r\n');
      });
    }).listen(socketName, function () {
      axios({
        socketPath: socketName,
        allowedSocketPaths: socketName,
        url: '/'
      })
        .then(function (resp) {
          assert.equal(resp.status, 200);
          assert.equal(resp.statusText, 'OK');
          done();
        })
        .catch(function (error) {
          assert.ifError(error);
          done();
        });
    });
  });

  it('should support sockets without an allowlist', function (done) {
    // Different sockets for win32 vs darwin/linux
    var socketName = './test.sock';

    if (process.platform === 'win32') {
      socketName = '\\\\.\\pipe\\libuv-test';
    }

    server = net.createServer(function (socket) {
      socket.on('data', function () {
        socket.end('HTTP/1.1 200 OK\r\n\r\n');
      });
    }).listen(socketName, function () {
      axios({
        socketPath: socketName,
        url: '/'
      })
        .then(function (resp) {
          assert.equal(resp.status, 200);
          assert.equal(resp.statusText, 'OK');
          done();
        })
        .catch(done);
    });
  });

  it('should reject disallowed socket paths before opening the socket', function (done) {
    var socketName = './test.sock';
    var openedSocket = false;

    if (process.platform === 'win32') {
      socketName = '\\\\.\\pipe\\libuv-test';
    }

    server = net.createServer(function (socket) {
      openedSocket = true;
      socket.end('HTTP/1.1 200 OK\r\n\r\n');
    }).listen(socketName, function () {
      axios({
        socketPath: socketName,
        allowedSocketPaths: './other.sock',
        url: '/'
      })
        .then(function () {
          done(new Error('request should not succeed'));
        })
        .catch(function (err) {
          assert.equal(err.code, AxiosError.ERR_BAD_OPTION_VALUE);
          assert.equal(openedSocket, false);
          done();
        });
    });
  });

  it('should reject socket paths when allowlist is empty', function (done) {
    var socketName = './test.sock';
    var openedSocket = false;

    if (process.platform === 'win32') {
      socketName = '\\\\.\\pipe\\libuv-test';
    }

    server = net.createServer(function (socket) {
      openedSocket = true;
      socket.end('HTTP/1.1 200 OK\r\n\r\n');
    }).listen(socketName, function () {
      axios({
        socketPath: socketName,
        allowedSocketPaths: [],
        url: '/'
      })
        .then(function () {
          done(new Error('request should not succeed'));
        })
        .catch(function (err) {
          assert.equal(err.code, AxiosError.ERR_BAD_OPTION_VALUE);
          assert.equal(openedSocket, false);
          done();
        });
    });
  });

  it('should inherit and clear socket path allowlists', function (done) {
    var socketName = './test.sock';

    if (process.platform === 'win32') {
      socketName = '\\\\.\\pipe\\libuv-test';
    }

    server = net.createServer(function (socket) {
      socket.on('data', function () {
        socket.end('HTTP/1.1 200 OK\r\n\r\n');
      });
    }).listen(socketName, function () {
      var instance = axios.create({
        allowedSocketPaths: socketName
      });

      instance({
        socketPath: socketName,
        url: '/'
      })
        .then(function (resp) {
          assert.equal(resp.status, 200);

          return axios.create({
            allowedSocketPaths: []
          })({
            socketPath: socketName,
            allowedSocketPaths: null,
            url: '/'
          });
        })
        .then(function (resp) {
          assert.equal(resp.status, 200);
          done();
        })
        .catch(done);
    });
  });

  it('should reject invalid socket path options', function (done) {
    axios({
      socketPath: {},
      url: '/'
    })
      .then(function () {
        done(new Error('request should not succeed'));
      })
      .catch(function (err) {
        assert.equal(err.code, AxiosError.ERR_BAD_OPTION_VALUE);

        return axios({
          socketPath: './test.sock',
          allowedSocketPaths: {},
          url: '/'
        });
      })
      .then(function () {
        done(new Error('request should not succeed'));
      })
      .catch(function (err) {
        assert.equal(err.code, AxiosError.ERR_BAD_OPTION_VALUE);

        return axios({
          socketPath: './test.sock',
          allowedSocketPaths: ['./test.sock', {}],
          url: '/'
        });
      })
      .then(function () {
        done(new Error('request should not succeed'));
      })
      .catch(function (err) {
        assert.equal(err.code, AxiosError.ERR_BAD_OPTION_VALUE);
        done();
      });
  });

  it('should support streams', function (done) {
    server = http.createServer(function (req, res) {
      req.pipe(res);
    }).listen(4444, function () {
      axios.post('http://localhost:4444/',
        fs.createReadStream(__filename), {
          responseType: 'stream'
        }).then(function (res) {
          var stream = res.data;
          var string = '';
          stream.on('data', function (chunk) {
            string += chunk.toString('utf8');
          });
          stream.on('end', function () {
            assert.equal(string, fs.readFileSync(__filename, 'utf8'));
            done();
          });
        });
    });
  });

  it('should pass errors for a failed stream', function (done) {
    var notExitPath = path.join(__dirname, 'does_not_exist');

    server = http.createServer(function (req, res) {
      req.pipe(res);
    }).listen(4444, function () {
      axios.post('http://localhost:4444/',
        fs.createReadStream(notExitPath)
      ).then(function (res) {
        assert.fail();
      }).catch(function (err) {
        assert.equal(err.message, `ENOENT: no such file or directory, open \'${notExitPath}\'`);
        done();
      });
    });
  });

  it('should support buffers', function (done) {
    var buf = Buffer.alloc(1024, 'x'); // Unsafe buffer < Buffer.poolSize (8192 bytes)
    server = http.createServer(function (req, res) {
      assert.equal(req.headers['content-length'], buf.length.toString());
      req.pipe(res);
    }).listen(4444, function () {
      axios.post('http://localhost:4444/',
        buf, {
          responseType: 'stream'
        }).then(function (res) {
          var stream = res.data;
          var string = '';
          stream.on('data', function (chunk) {
            string += chunk.toString('utf8');
          });
          stream.on('end', function () {
            assert.equal(string, buf.toString());
            done();
          });
        });
    });
  });

  it('should support HTTP proxies', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('12345');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '6789');
          });
        });

      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000
          }
        }).then(function (res) {
          assert.equal(res.data, '123456789', 'should pass through proxy');
          done();
        });
      });
    });
  });

  it('should support HTTPS proxies', function (done) {
    var options = {
      key: fs.readFileSync(path.join(__dirname, 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };

    server = https.createServer(options, function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('12345');
    }).listen(4444, function () {
      proxy = https.createServer(options, function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path,
          protocol: parsed.protocol,
          rejectUnauthorized: false
        };

        https.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '6789');
          });
        });
      }).listen(4000, function () {
        axios.get('https://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            protocol: 'https'
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          })
        }).then(function (res) {
          assert.equal(res.data, '123456789', 'should pass through proxy');
          done();
        }).catch(function (err) {
          assert.fail(err);
          done()
        });
      });
    });
  });

  it('should not pass through disabled proxy', function (done) {
    // set the env variable
    process.env.http_proxy = 'http://does-not-exists.example.com:4242/';

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('123456789');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        proxy: false
      }).then(function (res) {
        assert.equal(res.data, '123456789', 'should not pass through proxy');
        done();
      });
    });
  });

  it('should support proxy set via env var', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('4567');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '1234');
          });
        });

      }).listen(4000, function () {
        // set the env variable
        process.env.http_proxy = 'http://localhost:4000/';

        axios.get('http://localhost:4444/').then(function (res) {
          assert.equal(res.data, '45671234', 'should use proxy set by process.env.http_proxy');
          done();
        });
      });
    });
  });

  it('should support HTTPS proxy set via env var', function (done) {
    var options = {
      key: fs.readFileSync(path.join(__dirname, 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
    };

    server = https.createServer(options, function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('12345');
    }).listen(4444, function () {
      proxy = https.createServer(options, function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path,
          protocol: parsed.protocol,
          rejectUnauthorized: false
        };

        https.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '6789');
          });
        });
      }).listen(4000, function () {
        process.env.https_proxy = 'https://localhost:4000/';

        axios.get('https://localhost:4444/', {
          httpsAgent: new https.Agent({
            rejectUnauthorized: false
          })
        }).then(function (res) {
          assert.equal(res.data, '123456789', 'should pass through proxy');
          done();
        }).catch(function (err) {
          assert.fail(err);
          done()
        }).finally(function () {
          process.env.https_proxy = ''
        });
      });
    });
  });

  it('should not use proxy for domains in no_proxy', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('4567');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '1234');
          });
        });

      }).listen(4000, function () {
        // set the env variable
        process.env.http_proxy = 'http://localhost:4000/';
        process.env.no_proxy = 'foo.com, localhost,bar.net , , quix.co';

        axios.get('http://localhost:4444/').then(function (res) {
          assert.equal(res.data, '4567', 'should not use proxy for domains in no_proxy');
          done();
        });
      });
    });
  });

  it('should not use proxy for localhost with trailing dot when listed in no_proxy', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = 'localhost,127.0.0.1,::1';
      process.env.NO_PROXY = 'localhost,127.0.0.1,::1';

      axios.get('http://localhost.:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for localhost with trailing dot');
        done();
      });
    });
  });

  it('should not use proxy for bracketed IPv6 loopback when listed in no_proxy', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = 'localhost,127.0.0.1,::1';
      process.env.NO_PROXY = 'localhost,127.0.0.1,::1';

      axios.get('http://[::1]:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for IPv6 loopback');
        done();
      });
    });
  });

  it('should not use proxy for 127.0.0.1 when no_proxy is localhost', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = 'localhost';
      process.env.NO_PROXY = 'localhost';

      axios.get('http://127.0.0.1:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for IPv4 loopback alias');
        done();
      });
    });
  });

  it('should not use proxy for [::1] when no_proxy is localhost', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = 'localhost';
      process.env.NO_PROXY = 'localhost';

      axios.get('http://[::1]:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for IPv6 loopback alias');
        done();
      });
    });
  });

  // `0.0.0.0` is an alias for the local host, so a `no_proxy=localhost` policy
  // has to cover it - otherwise a request that the operator believes is local
  // is silently routed through (and readable by) the proxy.
  it('should not use proxy for 0.0.0.0 when no_proxy is localhost', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = 'localhost';
      process.env.NO_PROXY = 'localhost';

      axios.get('http://0.0.0.0:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for the unspecified IPv4 address');
        done();
      });
    });
  });

  it('should not use proxy for IPv4-mapped IPv6 host when the IPv4 alias is in no_proxy', function (done) {
    var proxyRequests = 0;

    proxy = http.createServer(function (request, response) {
      proxyRequests += 1;
      response.end('proxied');
    }).listen(4000, function () {
      process.env.http_proxy = 'http://localhost:4000/';
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.no_proxy = '127.0.0.1';
      process.env.NO_PROXY = '127.0.0.1';

      axios.get('http://[::ffff:7f00:1]:1/', {
        timeout: 100
      }).then(function () {
        done(new Error('request should not succeed'));
      }).catch(function () {
        assert.equal(proxyRequests, 0, 'should not use proxy for IPv4-mapped IPv6 loopback alias');
        done();
      });
    });
  });

  it('should use proxy for domains not in no_proxy', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end('4567');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(body + '1234');
          });
        });

      }).listen(4000, function () {
        // set the env variable
        process.env.http_proxy = 'http://localhost:4000/';
        process.env.no_proxy = 'foo.com, ,bar.net , quix.co';

        axios.get('http://localhost:4444/').then(function (res) {
          assert.equal(res.data, '45671234', 'should use proxy for domains not in no_proxy');
          done();
        });
      });
    });
  });

  it('should support HTTP proxy auth', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };
        var proxyAuth = request.headers['proxy-authorization'];

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(proxyAuth);
          });
        });

      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            auth: {
              username: 'user',
              password: 'pass'
            }
          }
        }).then(function (res) {
          var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
          assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy');
          done();
        });
      });
    });
  });

  it('should support proxy auth from env', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };
        var proxyAuth = request.headers['proxy-authorization'];

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(proxyAuth);
          });
        });

      }).listen(4000, function () {
        process.env.http_proxy = 'http://user:pass@localhost:4000/';

        axios.get('http://localhost:4444/').then(function (res) {
          var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
          assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy set by process.env.http_proxy');
          done();
        });
      });
    });
  });

  it('should support proxy auth with header', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };
        var proxyAuth = request.headers['proxy-authorization'];

        http.get(opts, function (res) {
          var body = '';
          res.on('data', function (data) {
            body += data;
          });
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(proxyAuth);
          });
        });

      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            auth: {
              username: 'user',
              password: 'pass'
            }
          },
          headers: {
            'Proxy-Authorization': 'Basic abc123'
          }
        }).then(function (res) {
          var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
          assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy');
          done();
        });
      });
    });
  });

  it('should support proxy auth in the string form', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };
        var proxyAuth = request.headers['proxy-authorization'];

        http.get(opts, function (res) {
          res.on('data', function () {});
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(proxyAuth || '');
          });
        });

      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            auth: 'user:pass'
          }
        }).then(function (res) {
          var base64 = Buffer.from('user:pass', 'utf8').toString('base64');
          assert.equal(res.data, 'Basic ' + base64, 'should authenticate to the proxy');
          done();
        }).catch(done);
      });
    });
  });

  // CVE-2026-44486 / CVE-2026-44487: proxy credentials are scoped to the proxy
  // they authenticate against and must never be handed to an origin server.
  it('should not send a caller-supplied proxy authorization header when no proxy is used', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end(req.headers['proxy-authorization'] || 'none');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        headers: {
          'Proxy-Authorization': 'Basic c2VjcmV0'
        }
      }).then(function (res) {
        assert.equal(res.data, 'none', 'proxy credentials must not reach the origin server');
        done();
      }).catch(done);
    });
  });

  it('should not send a caller-supplied proxy authorization header when the proxy is disabled', function (done) {
    process.env.http_proxy = 'http://does-not-exists.example.com:4242/';

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end(req.headers['proxy-authorization'] || 'none');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        proxy: false,
        headers: {
          'Proxy-Authorization': 'Basic c2VjcmV0'
        }
      }).then(function (res) {
        assert.equal(res.data, 'none', 'proxy credentials must not reach the origin server');
        done();
      }).catch(done);
    });
  });

  it('should remove proxy authorization case-insensitively when no proxy applies', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end(req.headers['proxy-authorization'] || 'none');
    }).listen(4444, function () {
      process.env.HTTP_PROXY = 'http://localhost:4000/';
      process.env.NO_PROXY = 'localhost';

      axios.get('http://localhost:4444/', {
        headers: {
          'pRoXy-AuThOrIzAtIoN': 'Basic stale'
        }
      }).then(function (res) {
        assert.equal(res.data, 'none', 'proxy credentials must not reach a no_proxy destination');
        done();
      }).catch(done);
    });
  });

  it('should keep proxy authorization when redirected request still uses authenticated proxy', function (done) {
    var requestCount = 0;
    var proxyUseCount = 0;
    var seenProxyAuth = [];
    var expectedAuth = 'Basic ' + Buffer.from('user:pass', 'utf8').toString('base64');

    server = http.createServer(function (req, res) {
      requestCount += 1;
      if (requestCount === 1) {
        res.setHeader('Location', 'http://localhost:4444/final');
        res.statusCode = 302;
      }
      res.end('ok');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        proxyUseCount += 1;
        seenProxyAuth.push(request.headers['proxy-authorization']);

        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          response.writeHead(res.statusCode, res.headers);
          res.on('data', function (data) {
            response.write(data);
          });
          res.on('end', function () {
            response.end();
          });
        });
      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            auth: {
              username: 'user',
              password: 'pass'
            }
          },
          maxRedirects: 1
        }).then(function (res) {
          assert.equal(res.data, 'ok');
          assert.equal(proxyUseCount, 2, 'the redirect must be routed through the proxy as well');
          assert.deepEqual(seenProxyAuth, [expectedAuth, expectedAuth]);
          done();
        }).catch(done);
      });
    });
  });

  // A caller-supplied `beforeRedirect` used to replace the hook `setProxy`
  // installs, so the redirected request left the proxy behind and delivered the
  // `Proxy-Authorization` header straight to the redirect target.
  it('should keep proxy authorization on redirect when a beforeRedirect hook is configured', function (done) {
    var requestCount = 0;
    var proxyUseCount = 0;
    var hookCalls = 0;
    var directProxyAuth = null;

    server = http.createServer(function (req, res) {
      requestCount += 1;
      if (requestCount === 1) {
        res.setHeader('Location', 'http://localhost:4444/final');
        res.statusCode = 302;
        res.end('ok');
        return;
      }
      // Reached through the proxy (no credentials) or - when the proxy hook was
      // lost - straight from axios, still carrying them.
      directProxyAuth = req.headers['proxy-authorization'] || null;
      res.end('ok');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        proxyUseCount += 1;

        var parsed = url.parse(request.url);
        var opts = {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.path
        };

        http.get(opts, function (res) {
          response.writeHead(res.statusCode, res.headers);
          res.on('data', function (data) {
            response.write(data);
          });
          res.on('end', function () {
            response.end();
          });
        });
      }).listen(4000, function () {
        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000,
            auth: {
              username: 'user',
              password: 'pass'
            }
          },
          maxRedirects: 1,
          beforeRedirect: function () {
            hookCalls += 1;
          }
        }).then(function (res) {
          assert.equal(res.data, 'ok');
          assert.equal(hookCalls, 1, 'the configured beforeRedirect hook must still run');
          assert.equal(proxyUseCount, 2, 'the redirect must still be routed through the proxy');
          assert.equal(directProxyAuth, null, 'proxy credentials must not reach the redirect target');
          done();
        }).catch(done);
      });
    });
  });

  it('should not use inherited proxy auth credentials', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        var parsed = url.parse(request.url);
        // Null-prototype so the pollution below cannot leak into the request
        // this test proxy makes on behalf of the client.
        var opts = Object.create(null);
        opts.host = parsed.hostname;
        opts.port = parsed.port;
        opts.path = parsed.path;
        opts.auth = undefined;
        var proxyAuth = request.headers['proxy-authorization'];

        http.get(opts, function (res) {
          res.on('data', function () {});
          res.on('end', function () {
            response.setHeader('Content-Type', 'text/html; charset=UTF-8');
            response.end(proxyAuth || '');
          });
        });

      }).listen(4000, function () {
        Object.prototype.auth = {};
        Object.prototype.username = 'polluted-user';
        Object.prototype.password = 'polluted-pass';

        axios.get('http://localhost:4444/', {
          proxy: {
            host: 'localhost',
            port: 4000
          }
        }).then(function (res) {
          clearPrototypePollution();
          assert.equal(res.data, '', 'should not send inherited credentials to the proxy');
          done();
        }).catch(function (err) {
          clearPrototypePollution();
          done(err);
        });
      });
    });
  });

  it('should not use an inherited proxy destination', function (done) {
    var proxyRequests = 0;

    server = http.createServer(function (req, res) {
      res.end('direct');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        proxyRequests += 1;
        response.end('proxied');
      }).listen(4000, function () {
        Object.prototype.proxy = {
          host: 'localhost',
          port: 4000
        };

        axios.get('http://localhost:4444/', {
          maxRedirects: 0
        }).then(function (res) {
          clearPrototypePollution();
          assert.equal(res.data, 'direct');
          assert.equal(proxyRequests, 0, 'should not route the request through an inherited proxy');
          done();
        }).catch(function (err) {
          clearPrototypePollution();
          done(err);
        });
      });
    });
  });

  it('should not send inherited header buckets on GET requests', function (done) {
    var inheritedHeaderBuckets = Object.create(null);
    inheritedHeaderBuckets.common = {'x-polluted-common': 'yes'};
    inheritedHeaderBuckets.get = {'x-polluted-get': 'yes'};

    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.end([
        req.headers['x-polluted-common'] || 'none',
        req.headers['x-polluted-get'] || 'none',
        req.headers['x-request'] || 'none'
      ].join(','));
    }).listen(4444, function () {
      var requestHeaders = Object.create(inheritedHeaderBuckets);
      requestHeaders['x-request'] = 'request';

      axios.get('http://localhost:4444/', {
        headers: requestHeaders
      }).then(function (res) {
        assert.equal(res.data, 'none,none,request');
        done();
      }).catch(done);
    });
  });

  it('should not send inherited header buckets on requests with a body', function (done) {
    server = http.createServer(function (req, res) {
      var seen = [
        req.headers['x-polluted-common'] || 'none',
        req.headers['x-polluted-post'] || 'none',
        req.headers['x-own-common'] || 'none',
        req.headers['x-own-post'] || 'none',
        req.headers['x-request'] || 'none'
      ].join(',');

      req.on('data', function () {});
      req.on('end', function () {
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.end(seen);
      });
    }).listen(4444, function () {
      Object.prototype.common = {'x-polluted-common': 'yes'};
      Object.prototype.post = {'x-polluted-post': 'yes'};

      var instance = axios.create({
        headers: {
          common: {
            'x-own-common': 'default'
          },
          post: {
            'x-own-post': 'method'
          }
        }
      });

      instance.post('http://localhost:4444/', 'body', {
        headers: {
          'x-request': 'request'
        }
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'none,none,default,method,request');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not use a transport inherited from Object.prototype', function (done) {
    var transportCalls = 0;

    server = http.createServer(function (req, res) {
      res.end('direct');
    }).listen(4444, function () {
      Object.prototype.transport = {
        request: function () {
          transportCalls += 1;
          return http.request.apply(http, arguments);
        }
      };

      axios.get('http://localhost:4444/', {
        maxRedirects: 0
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'direct');
        assert.equal(transportCalls, 0, 'should not issue the request through an inherited transport');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  // GHSA-q8qp-cvcw-x6jj: `auth`, `baseURL`, `socketPath`, `beforeRedirect` and
  // `insecureHTTPParser` were read through the prototype chain, so a polluted
  // `Object.prototype.<key>` was treated as if the caller had supplied it.
  it('should not send an Authorization header inherited from Object.prototype', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end(req.headers.authorization || 'no-auth');
    }).listen(4444, function () {
      Object.prototype.auth = { username: 'attacker', password: 'exfil' };

      axios.get('http://localhost:4444/api').then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'no-auth', 'should not send inherited credentials');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not use credential fields inherited from Object.prototype', function (done) {
    server = http.createServer(function (req, res) {
      res.setHeader('Content-Type', 'text/plain');
      res.end(req.headers.authorization || 'no-auth');
    }).listen(4444, function () {
      Object.prototype.username = 'attacker';
      Object.prototype.password = 'exfil';

      axios.get('http://localhost:4444/api', {
        auth: {}
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'Basic ' + Buffer.from(':', 'utf8').toString('base64'));
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not prefix an absolute url with a baseURL inherited from Object.prototype', function (done) {
    var hijackHits = 0;

    server = http.createServer(function (req, res) {
      res.end('target');
    }).listen(4444, function () {
      proxy = http.createServer(function (req, res) {
        hijackHits += 1;
        res.end('hijacked');
      }).listen(4000, function () {
        Object.prototype.baseURL = 'http://localhost:4000';

        axios.get('http://localhost:4444/api', {
          allowAbsoluteUrls: false
        }).then(function (res) {
          clearPrototypePollution();
          assert.equal(res.data, 'target');
          assert.equal(hijackHits, 0, 'should not route the request through an inherited baseURL');
          done();
        }).catch(function (err) {
          clearPrototypePollution();
          done(err);
        });
      });
    });
  });

  it('should not resolve a relative url against a baseURL inherited from Object.prototype', function (done) {
    var hijackHits = 0;

    proxy = http.createServer(function (req, res) {
      hijackHits += 1;
      res.end('hijacked');
    }).listen(4000, function () {
      Object.prototype.baseURL = 'http://localhost:4000';

      axios.get('/api', { timeout: 5000 }).then(function (res) {
        return res.data;
      }, function () {
        return null;
      }).then(function (data) {
        clearPrototypePollution();
        assert.equal(hijackHits, 0, 'should not route a relative request through an inherited baseURL');
        assert.notEqual(data, 'hijacked');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not connect to a socketPath inherited from Object.prototype', function (done) {
    server = http.createServer(function (req, res) {
      res.end('direct');
    }).listen(4444, function () {
      Object.prototype.socketPath = path.join(__dirname, 'axios-should-never-be-used.sock');

      axios.get('http://localhost:4444/api').then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'direct');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not invoke a beforeRedirect hook inherited from Object.prototype', function (done) {
    var hijackCalled = false;

    server = http.createServer(function (req, res) {
      if (req.url === '/start') {
        res.setHeader('Location', '/final');
        res.statusCode = 302;
        res.end();
        return;
      }
      res.end('final');
    }).listen(4444, function () {
      Object.prototype.beforeRedirect = function pollutedBeforeRedirect() {
        hijackCalled = true;
      };

      axios.get('http://localhost:4444/start', {
        maxRedirects: 3
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'final');
        assert.equal(hijackCalled, false, 'should not invoke an inherited beforeRedirect hook');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should still honour an explicitly configured beforeRedirect hook', function (done) {
    var calls = 0;

    server = http.createServer(function (req, res) {
      if (req.url === '/start') {
        res.setHeader('Location', '/final');
        res.statusCode = 302;
        res.end();
        return;
      }
      res.end('final');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/start', {
        maxRedirects: 3,
        beforeRedirect: function () {
          calls += 1;
        }
      }).then(function (res) {
        assert.equal(res.data, 'final');
        assert.equal(calls, 1, 'the configured beforeRedirect hook must still run');
        done();
      }).catch(done);
    });
  });

  it('should always pass an own insecureHTTPParser flag to the transport', function (done) {
    var captured = null;
    var capturedRequest = null;

    server = http.createServer(function (req, res) {
      res.end('ok');
    }).listen(4444, function () {
      Object.prototype.insecureHTTPParser = true;

      axios.get('http://localhost:4444/', {
        transport: {
          request: function (options, handler) {
            captured = options;
            capturedRequest = http.request(options, handler);
            return capturedRequest;
          }
        }
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'ok');
        assert.ok(captured, 'the configured transport should have been used');
        assert.equal(
          Object.prototype.hasOwnProperty.call(captured, 'insecureHTTPParser'),
          true,
          'insecureHTTPParser must be an own property of the request options'
        );
        assert.strictEqual(captured.insecureHTTPParser, false);
        // The own `false` has to survive the copies node makes of the options,
        // otherwise the inherited `true` would reach the parser.
        assert.notStrictEqual(
          capturedRequest.insecureHTTPParser,
          true,
          'node must not have enabled the lenient HTTP parser'
        );
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not enable the lenient HTTP parser through Object.prototype', function (done) {
    // A response that carries both Content-Length and Transfer-Encoding is
    // rejected by the strict parser and accepted by the lenient one. The
    // payload is only discriminating on runtimes shipping llhttp, so the
    // assertion that actually depends on it is guarded; the invariant that a
    // polluted prototype cannot change how the response is parsed is checked
    // on every runtime.
    var payload = [
      'HTTP/1.1 200 OK',
      'Content-Type: text/plain',
      'Content-Length: 2',
      'Transfer-Encoding: chunked',
      '',
      '2',
      'ok',
      '0',
      '',
      ''
    ].join('\r\n');

    function attempt(config) {
      return axios.get('http://localhost:4444/', config).then(function () {
        return true;
      }, function () {
        return false;
      });
    }

    server = net.createServer(function (socket) {
      socket.once('data', function () {
        socket.end(payload);
      });
    });

    server.listen(4444, function () {
      var strictOk;
      var lenientOk;

      attempt().then(function (result) {
        strictOk = result;
        return attempt({ insecureHTTPParser: true });
      }).then(function (result) {
        lenientOk = result;
        Object.prototype.insecureHTTPParser = true;
        return attempt();
      }).then(function (pollutedOk) {
        clearPrototypePollution();
        assert.strictEqual(
          pollutedOk,
          strictOk,
          'an inherited insecureHTTPParser must not change how the response is parsed'
        );
        if (lenientOk && !strictOk) {
          assert.strictEqual(pollutedOk, false, 'the lenient parser must not be reachable via the prototype');
        }
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not use params or paramsSerializer inherited from Object.prototype', function (done) {
    var serializerCalled = false;

    server = http.createServer(function (req, res) {
      res.end(req.url);
    }).listen(4444, function () {
      Object.prototype.params = { injected: 'yes' };
      Object.prototype.paramsSerializer = function pollutedSerializer() {
        serializerCalled = true;
        return 'injected=yes';
      };

      axios.get('http://localhost:4444/x').then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, '/x');
        assert.equal(serializerCalled, false, 'should not use an inherited paramsSerializer');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  // `mergeConfig` hands the adapter a null-prototype config, but a request
  // interceptor that clones it onto a plain `{}` puts `Object.prototype` back
  // on the chain - every config field the adapter reads has to be an own-property
  // read to stay safe there.
  it('should not use inherited proxy after request interceptor clones config', function (done) {
    var proxyRequests = 0;

    process.env.no_proxy = 'localhost,127.0.0.1,::1';

    server = http.createServer(function (req, res) {
      res.end('target');
    }).listen(4444, function () {
      proxy = http.createServer(function (request, response) {
        proxyRequests += 1;
        response.end('proxy');
      }).listen(4000, function () {
        Object.prototype.proxy = {
          protocol: 'http',
          host: 'localhost',
          port: 4000
        };

        var instance = axios.create();

        instance.interceptors.request.use(function (config) {
          var clone = Object.assign({}, config);
          clone.headers = Object.assign({}, config.headers);
          return clone;
        });

        instance.get('http://localhost:4444/secret', {
          headers: {
            Authorization: 'Bearer test'
          }
        }).then(function (res) {
          clearPrototypePollution();
          assert.equal(res.data, 'target');
          assert.equal(proxyRequests, 0, 'should not route the request through an inherited proxy');
          done();
        }).catch(function (err) {
          clearPrototypePollution();
          done(err);
        });
      });
    });
  });

  it('should not use inherited paramsSerializer after request interceptor clones config', function (done) {
    var serializerCalled = false;

    server = http.createServer(function (req, res) {
      res.end(req.url);
    }).listen(4444, function () {
      Object.prototype.paramsSerializer = function pollutedSerializer() {
        serializerCalled = true;
        return 'polluted=1';
      };

      var instance = axios.create();

      instance.interceptors.request.use(function (config) {
        return Object.assign({}, config);
      });

      instance.get('http://localhost:4444/demo', {
        params: {
          safe: '1'
        }
      }).then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, '/demo?safe=1');
        assert.equal(serializerCalled, false, 'should not use an inherited paramsSerializer');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  it('should not use an httpAgent inherited from Object.prototype', function (done) {
    var agentUsed = false;
    var pollutedAgent = new http.Agent({ keepAlive: false });
    var originalCreateConnection = pollutedAgent.createConnection;

    pollutedAgent.createConnection = function () {
      agentUsed = true;
      return originalCreateConnection.apply(this, arguments);
    };

    server = http.createServer(function (req, res) {
      res.end('ok');
    }).listen(4444, function () {
      Object.prototype.httpAgent = pollutedAgent;

      axios.get('http://localhost:4444/').then(function (res) {
        clearPrototypePollution();
        assert.equal(res.data, 'ok');
        assert.equal(agentUsed, false, 'should not use an inherited httpAgent');
        done();
      }).catch(function (err) {
        clearPrototypePollution();
        done(err);
      });
    });
  });

  describe('redirect hooks', function () {
    function listen(handler) {
      return new Promise(function (resolve) {
        var server = http.createServer(handler);
        server.listen(0, '127.0.0.1', function () {
          resolve(server);
        });
      });
    }

    // Starts a redirector pointing at a legitimate server plus an attacker
    // server that records any hit, then runs `pollute` (which receives the
    // attacker's port) right before the request is sent.
    function followRedirectWithPollution(pollute) {
      var legitHits = [];
      var attackerHits = [];
      var legit;
      var attacker;
      var redirector;

      function closeAll() {
        [legit, attacker, redirector].forEach(function closeServer(server) {
          if (server) {
            server.close();
          }
        });
      }

      // Servers are constructed before any pollution is applied.
      return listen(function (req, res) {
        legitHits.push(req.url);
        res.end('LEGIT');
      }).then(function (server) {
        legit = server;

        return listen(function (req, res) {
          attackerHits.push(req.url);
          res.end('ATTACKER');
        });
      }).then(function (server) {
        attacker = server;

        return listen(function (req, res) {
          res.writeHead(302, { Location: 'http://127.0.0.1:' + legit.address().port + '/secret' });
          res.end();
        });
      }).then(function (server) {
        redirector = server;

        pollute(attacker.address().port);

        return axios.get('http://127.0.0.1:' + redirector.address().port + '/start');
      }).then(function (response) {
        try {
          assert.strictEqual(response.data, 'LEGIT');
          assert.deepStrictEqual(legitHits, ['/secret']);
          assert.deepStrictEqual(attackerHits, []);
        } finally {
          // Must run even when an assertion throws, or the open servers keep
          // the test runner alive.
          closeAll();
        }
      }, function (error) {
        closeAll();
        throw error;
      });
    }

    it('should not use an inherited redirect hook from Object.prototype', function () {
      return followRedirectWithPollution(function (attackerPort) {
        // Upstream's adapter only populated its `config` redirect hook when the
        // caller supplied beforeRedirect, so an inherited function was reachable
        // and could repoint the redirect at another host.
        Object.prototype.config = function pollutedHook(options) {
          options.hostname = '127.0.0.1';
          options.host = '127.0.0.1';
          options.port = attackerPort;
        };
      });
    });

    it('should not use an inherited beforeRedirect hook to repoint the redirect', function () {
      return followRedirectWithPollution(function (attackerPort) {
        // This version hands a single `beforeRedirect` option to
        // follow-redirects, which copies the options onto a fresh object, so
        // an inherited hook would run on every redirect and could repoint it.
        Object.prototype.beforeRedirect = function pollutedHook(options) {
          options.hostname = '127.0.0.1';
          options.host = '127.0.0.1';
          options.port = attackerPort;
        };
      });
    });
  });

  it('should support cancel', function (done) {
    var source = axios.CancelToken.source();
    server = http.createServer(function (req, res) {
      // call cancel() when the request has been sent, but a response has not been received
      source.cancel('Operation has been canceled.');
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        cancelToken: source.token
      }).catch(function (thrown) {
        assert.ok(thrown instanceof axios.Cancel, 'Promise must be rejected with a CanceledError object');
        assert.equal(thrown.message, 'Operation has been canceled.');
        done();
      });
    });
  });

  it('should combine baseURL and url', function (done) {
    server = http.createServer(function (req, res) {
      res.end();
    }).listen(4444, function () {
      axios.get('/foo', {
        baseURL: 'http://localhost:4444/',
      }).then(function (res) {
        assert.equal(res.config.baseURL, 'http://localhost:4444/');
        assert.equal(res.config.url, '/foo');
        done();
      });
    });
  });

  it('should support HTTP protocol', function (done) {
    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      axios.get('http://localhost:4444')
        .then(function (res) {
          assert.equal(res.request.agent.protocol, 'http:');
          done();
        })
    })
  });

  it('should support HTTPS protocol', function (done) {
    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      axios.get('https://www.google.com')
        .then(function (res) {
          assert.equal(res.request.agent.protocol, 'https:');
          done();
        })
    })
  });

  it('should return malformed URL', function (done) {
    var success = false, failure = false;
    var error;

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      axios.get('tel:484-695-3408')
        .then(function (res) {
          success = true;
        }).catch(function (err) {
          error = err;
          failure = true;
        })

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.message, 'Unsupported protocol tel:');
        done();
      }, 300);
    })
  });

  it('should return unsupported protocol', function (done) {
    var success = false, failure = false;
    var error;

    server = http.createServer(function (req, res) {
      setTimeout(function () {
        res.end();
      }, 1000);
    }).listen(4444, function () {
      axios.get('ftp:google.com')
        .then(function (res) {
          success = true;
        }).catch(function (err) {
          error = err;
          failure = true;
        })

      setTimeout(function () {
        assert.equal(success, false, 'request should not succeed');
        assert.equal(failure, true, 'request should fail');
        assert.equal(error.message, 'Unsupported protocol ftp:');
        done();
      }, 300);
    })
  });

  it('should supply a user-agent if one is not specified', function (done) {
    server = http.createServer(function (req, res) {
      assert.equal(req.headers["user-agent"], 'axios/' + pkg.version);
      res.end();
    }).listen(4444, function () {
      axios.get('http://localhost:4444/'
      ).then(function (res) {
        done();
      });
    });
  });

  it('should omit a user-agent if one is explicitly disclaimed', function (done) {
    server = http.createServer(function (req, res) {
      assert.equal("user-agent" in req.headers, false);
      assert.equal("User-Agent" in req.headers, false);
      res.end();
    }).listen(4444, function () {
      axios.get('http://localhost:4444/', {
        headers: {
          "User-Agent": null
        }
      }
      ).then(function (res) {
        done();
      });
    });
  });

  it('should throw an error if http server that aborts a chunked request', function (done) {
    server = http.createServer(function (req, res) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('chunk 1');
      setTimeout(function () {
        res.write('chunk 2');
      }, 100);
      setTimeout(function() {
        res.destroy();
      }, 200);
    }).listen(4444, function () {
      var success = false, failure = false;
      var error;

      axios.get('http://localhost:4444/aborted', {
        timeout: 500
      }).then(function (res) {
        success = true;
      }).catch(function (err) {
        error = err;
        failure = true;
      }).finally(function () {
        assert.strictEqual(success, false, 'request should not succeed');
        assert.strictEqual(failure, true, 'request should fail');
        assert.strictEqual(error.code, 'ERR_BAD_RESPONSE');
        assert.strictEqual(error.message, 'maxContentLength size of -1 exceeded');
        done();
      });
    });
  });

  it('should allow passing FormData', function (done) {
    var form = new FormData();
    var file1= Buffer.from('foo', 'utf8');

    form.append('foo', "bar");
    form.append('file1', file1, {
      filename: 'bar.jpg',
      filepath: 'temp/bar.jpg',
      contentType: 'image/jpeg'
    });

    server = http.createServer(function (req, res) {
      var receivedForm = new formidable.IncomingForm();

      receivedForm.parse(req, function (err, fields, files) {
        if (err) {
          return done(err);
        }

        res.end(JSON.stringify({
          fields: fields,
          files: files
        }));
      });
    }).listen(4444, function () {
      axios.post('http://localhost:4444/', form, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }).then(function (res) {
        assert.deepStrictEqual(res.data.fields,{foo: 'bar'});

        assert.strictEqual(res.data.files.file1.mimetype,'image/jpeg');
        assert.strictEqual(res.data.files.file1.originalFilename,'temp/bar.jpg');
        assert.strictEqual(res.data.files.file1.size,3);

        done();
      }).catch(done);
    });
  });

  describe("maxContentLength with responseType stream (GHSA-vf2m-468p-8v99)", function () {
    it("should reject when streamed response exceeds maxContentLength", function (done) {
      var payload = Buffer.alloc(2048, "a");
      server = http
        .createServer(function (req, res) {
          res.end(payload);
        })
        .listen(4444, function () {
          axios
            .get("http://localhost:4444/", {
              responseType: "stream",
              maxContentLength: 1024,
            })
            .then(function (response) {
              var received = 0;
              var errored = false;
              response.data.on("data", function (chunk) {
                received += chunk.length;
              });
              response.data.on("error", function (err) {
                errored = true;
                assert.ok(
                  /maxContentLength/.test(err.message),
                  "expected maxContentLength error, got " + err.message,
                );
                done();
              });
              response.data.on("end", function () {
                if (!errored) {
                  done(
                    new Error(
                      "stream ended without error; received " +
                        received +
                        " bytes",
                    ),
                  );
                }
              });
            })
            .catch(done);
        });
    });

    it("should allow streamed responses under maxContentLength", function (done) {
      var payload = Buffer.alloc(512, "b");
      server = http
        .createServer(function (req, res) {
          res.end(payload);
        })
        .listen(4444, function () {
          axios
            .get("http://localhost:4444/", {
              responseType: "stream",
              maxContentLength: 1024,
            })
            .then(function (response) {
              var chunks = [];
              response.data.on("data", function (chunk) {
                chunks.push(chunk);
              });
              response.data.on("end", function () {
                var body = Buffer.concat(chunks);
                assert.strictEqual(body.length, 512);
                done();
              });
              response.data.on("error", done);
            })
            .catch(done);
        });
    });
  });

  describe("maxBodyLength with streamed upload and maxRedirects=0 (GHSA-5c9x-8gcm-mpgx)", function () {
    it("should reject streamed upload exceeding maxBodyLength with native transport", function (done) {
      var received = 0;
      server = http
        .createServer(function (req, res) {
          req.on("data", function (chunk) {
            received += chunk.length;
          });
          req.on("end", function () {
            res.end(JSON.stringify({ received: received }));
          });
        })
        .listen(4444, function () {
          var stream = require("stream");
          var Readable = stream.Readable;
          var chunks = [];
          for (var i = 0; i < 20; i++) chunks.push(Buffer.alloc(1024, "c"));
          var body = Readable.from(chunks);
          axios
            .post("http://localhost:4444/", body, {
              maxBodyLength: 1024,
              maxRedirects: 0,
            })
            .then(function () {
              done(
                new Error(
                  "expected maxBodyLength rejection, got success (received " +
                    received +
                    ")",
                ),
              );
            })
            .catch(function (err) {
              try {
                assert.ok(
                  err instanceof AxiosError,
                  "expected AxiosError, got " + err,
                );
                assert.ok(
                  /maxBodyLength/.test(err.message),
                  "expected maxBodyLength error, got " + err.message,
                );
                done();
              } catch (e) {
                done(e);
              }
            });
        });
    });
  });

  describe('prototype pollution (GHSA-6chq-wfr3-2hj9)', function () {
    var pollutedKeys = ['getHeaders', 'append', 'pipe', 'on', 'once'];
    var toStringTagSym = Symbol.toStringTag;
    var originalToString = Object.prototype.toString;

    function pollute() {
      Object.prototype[toStringTagSym] = 'FormData';
      Object.prototype.append = function () {};
      Object.prototype.getHeaders = function () {
        return {
          'x-injected': 'attacker',
          'authorization': 'Bearer ATTACKER_TOKEN'
        };
      };
      Object.prototype.pipe = function (d) { if (d && d.end) d.end(); return d; };
      Object.prototype.on = function () { return this; };
      Object.prototype.once = function () { return this; };
    }

    function cleanup() {
      for (var i = 0; i < pollutedKeys.length; i++) delete Object.prototype[pollutedKeys[i]];
      delete Object.prototype[toStringTagSym];
      // `toString` is a builtin - restore it instead of deleting it.
      Object.prototype.toString = originalToString;
    }

    // Safety net: if a request hangs and mocha times out, `finish()` never runs.
    afterEach(cleanup);

    it('should not merge prototype-polluted getHeaders into outgoing request', function (done) {
      var receivedHeaders;
      server = http.createServer(function (req, res) {
        receivedHeaders = req.headers;
        res.end('{}');
      }).listen(4444, function () {
        pollute();
        var finish = function (requestError) {
          cleanup();
          try {
            assert.ok(
              receivedHeaders,
              'request must reach server to prove polluted headers were not merged' +
                (requestError ? ' (request errored: ' + requestError.message + ')' : '')
            );
            assert.strictEqual(receivedHeaders['x-injected'], undefined);
            assert.notStrictEqual(receivedHeaders['authorization'], 'Bearer ATTACKER_TOKEN');
            done();
          } catch (e) {
            done(e);
          }
        };
        axios.post('http://localhost:4444/', { userId: 42 }, {
          headers: { 'Authorization': 'Bearer VALID_USER_TOKEN' }
        }).then(function () {
          finish();
        }).catch(function (err) {
          finish(err);
        });
      });
    });

    it('should not merge polluted getHeaders when Object.prototype.toString spoofs FormData', function (done) {
      var receivedHeaders;
      server = http.createServer(function (req, res) {
        receivedHeaders = req.headers;
        res.end('{}');
      }).listen(4444, function () {
        // A plain JSON payload plus a polluted `toString` was enough to make the
        // pre-fix `isFormData` accept it, so `getHeaders()` - also taken from the
        // polluted prototype - was merged straight into the outgoing headers.
        Object.prototype.toString = function () { return '[object FormData]'; };
        Object.prototype.getHeaders = function () {
          return {
            'x-injected': 'attacker',
            'authorization': 'Bearer ATTACKER_TOKEN'
          };
        };
        Object.prototype.pipe = function (d) { if (d && d.end) d.end(); return d; };
        Object.prototype.on = function () { return this; };
        Object.prototype.once = function () { return this; };

        var finish = function (requestError) {
          cleanup();
          try {
            assert.ok(
              receivedHeaders,
              'request must reach server to prove polluted headers were not merged' +
                (requestError ? ' (request errored: ' + requestError.message + ')' : '')
            );
            assert.strictEqual(receivedHeaders['x-injected'], undefined);
            assert.strictEqual(receivedHeaders['authorization'], 'Bearer VALID_USER_TOKEN');
            done();
          } catch (e) {
            done(e);
          }
        };
        axios.post('http://localhost:4444/', { userId: 42 }, {
          headers: { 'Authorization': 'Bearer VALID_USER_TOKEN' }
        }).then(function () {
          finish();
        }).catch(function (err) {
          finish(err);
        });
      });
    });
  });

});

