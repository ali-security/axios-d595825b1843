
describe('FormData', function() {
  it('should allow FormData posting', function () {
    if (typeof window !== 'undefined') {
      return; // Skip in browser environment due to CORS problem
    }
    return axios.postForm('http://httpbin.org/post', {
      a: 'foo',
      b: 'bar'
    }).then(({data}) => {
      expect(data.form).toEqual({
        a: 'foo',
        b: 'bar'
      });
    });
  });
})
