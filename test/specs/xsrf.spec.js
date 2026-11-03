'use strict';

var cookies = require('../../lib/helpers/cookies');

describe('xsrf', function() {
  beforeEach(function() {
    jasmine.Ajax.install();
  });

  afterEach(function() {
    document.cookie = axios.defaults.xsrfCookieName + '=;expires=' + new Date(Date.now() - 86400000).toGMTString();
    jasmine.Ajax.uninstall();
  });

  it('should not set xsrf header if cookie is null', function(done) {
    axios('/foo');

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
      done();
    });
  });

  it('should set xsrf header if cookie is set', function(done) {
    document.cookie = axios.defaults.xsrfCookieName + '=12345';

    axios('/foo');

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual('12345');
      done();
    });
  });

  it('should not set xsrf header if xsrfCookieName is null', function(done) {
    document.cookie = axios.defaults.xsrfCookieName + '=12345';

    axios('/foo', {
      xsrfCookieName: null
    });

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
      done();
    });
  });

  it('should not read cookies at all if xsrfCookieName is null', function(done) {
    spyOn(cookies, 'read');

    axios('/foo', {
      xsrfCookieName: null
    });

    getAjaxRequest().then(function() {
      expect(cookies.read).not.toHaveBeenCalled();
      done();
    });
  });

  it('should not set xsrf header for cross origin', function(done) {
    document.cookie = axios.defaults.xsrfCookieName + '=12345';

    axios('http://example.com/');

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
      done();
    });
  });

  it('should not set xsrf header for cross origin when using withCredentials', function(done) {
    document.cookie = axios.defaults.xsrfCookieName + '=12345';

    axios('http://example.com/', {
      withCredentials: true
    });

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
      done();
    });
  });

  it('should set xsrf header for cross origin when using withCredentials and withXSRFToken', function(done) {
    document.cookie = axios.defaults.xsrfCookieName + '=12345';

    axios('http://example.com/', {
      withCredentials: true,
      withXSRFToken: true
    });

    getAjaxRequest().then(function(request) {
      expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual('12345');
      done();
    });
  });
  describe('withXSRFToken option', function() {
    it('should set xsrf header for cross origin when withXSRFToken = true', function(done) {
      var token = '12345';

      document.cookie = axios.defaults.xsrfCookieName + '=' + token;

      axios('http://example.com/', {
        withXSRFToken: true
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(token);
        done();
      });
    });

    it('should not set xsrf header for the same origin when withXSRFToken = false', function(done) {
      var token = '12345';

      document.cookie = axios.defaults.xsrfCookieName + '=' + token;

      axios('/foo', {
        withXSRFToken: false
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for the same origin when withXSRFToken = false', function(done) {
      var token = '12345';

      document.cookie = axios.defaults.xsrfCookieName + '=' + token;

      axios('/foo', {
        withXSRFToken: false
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when the resolver returns false', function(done) {
      var token = '12345';

      document.cookie = axios.defaults.xsrfCookieName + '=' + token;

      axios('http://example.com/', {
        withCredentials: true,
        withXSRFToken: function(config) { return config.userFlag === 'yes';},
        userFlag: 'no'
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should support function resolver', function(done) {
      var token = '12345';

      document.cookie = axios.defaults.xsrfCookieName + '=' + token;
      axios('/foo', {
        withXSRFToken: function(config) { return config.userFlag === 'yes';},
        userFlag: 'yes'
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(token);
        done();
      });
    });
  });

  // GHSA-xx6v-rp6x-q39c: `withXSRFToken` used to be evaluated with a loose
  // truthy test, so ANY truthy non-boolean value - `1`, `'false'`, `{}`, `[]`,
  // or a resolver returning one of those - short-circuited the same-origin
  // guard and leaked the XSRF cookie to a cross-origin host. Only an explicit
  // boolean `true` may skip that guard.
  describe('withXSRFToken strict boolean check', function() {
    var token = '12345';

    beforeEach(function() {
      document.cookie = axios.defaults.xsrfCookieName + '=' + token;
    });

    afterEach(function() {
      delete Object.prototype.withXSRFToken;
    });

    it('should not set xsrf header for cross origin when withXSRFToken is the number 1', function(done) {
      axios('http://example.com/', {
        withXSRFToken: 1
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when withXSRFToken is a non-empty string', function(done) {
      axios('http://example.com/', {
        withXSRFToken: 'true'
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when withXSRFToken is the string "false"', function(done) {
      axios('http://example.com/', {
        withXSRFToken: 'false'
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when withXSRFToken is an object', function(done) {
      axios('http://example.com/', {
        withXSRFToken: {}
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when withXSRFToken is an array', function(done) {
      axios('http://example.com/', {
        withXSRFToken: []
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when the resolver returns a truthy number', function(done) {
      axios('http://example.com/', {
        withXSRFToken: function() { return 1; }
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when the resolver returns a non-empty string', function(done) {
      axios('http://example.com/', {
        withXSRFToken: function() { return 'yes'; }
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should not set xsrf header for cross origin when withXSRFToken is inherited from Object.prototype',
      function(done) {
        Object.prototype.withXSRFToken = 1;

        axios('http://example.com/');

        getAjaxRequest().then(function(request) {
          expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
          done();
        });
      });

    it('should not set xsrf header for cross origin when Object.prototype.withXSRFToken is true', function(done) {
      Object.prototype.withXSRFToken = true;

      axios('http://example.com/');

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(undefined);
        done();
      });
    });

    it('should still set xsrf header for cross origin when the resolver returns boolean true', function(done) {
      axios('http://example.com/', {
        withXSRFToken: function() { return true; }
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(token);
        done();
      });
    });

    it('should still set xsrf header for the same origin when withXSRFToken is a truthy non-boolean', function(done) {
      axios('/foo', {
        withXSRFToken: 1
      });

      getAjaxRequest().then(function(request) {
        expect(request.requestHeaders[axios.defaults.xsrfHeaderName]).toEqual(token);
        done();
      });
    });
  });
});
