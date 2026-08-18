const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyGraphqlErrors, graphqlEndpoint, buildRequestOptions } = require('./githubClient');

test('classifyGraphqlErrors: NOT_FOUND maps to 404', () => {
  const status = classifyGraphqlErrors([{ type: 'NOT_FOUND', message: 'Could not resolve to a Repository' }]);
  assert.equal(status, 404);
});

test('classifyGraphqlErrors: FORBIDDEN maps to 403', () => {
  const status = classifyGraphqlErrors([{ type: 'FORBIDDEN', message: 'Resource not accessible' }]);
  assert.equal(status, 403);
});

test('classifyGraphqlErrors: unrecognized type maps to 502', () => {
  const status = classifyGraphqlErrors([{ type: 'INTERNAL', message: 'Something went wrong' }]);
  assert.equal(status, 502);
});

test('classifyGraphqlErrors: type-less error maps to 502', () => {
  const status = classifyGraphqlErrors([{ message: 'no type field here' }]);
  assert.equal(status, 502);
});

test('classifyGraphqlErrors: mixed array containing NOT_FOUND classified as 404', () => {
  const status = classifyGraphqlErrors([
    { type: 'INTERNAL', message: 'transient issue' },
    { type: 'NOT_FOUND', message: 'Could not resolve to a Repository' },
  ]);
  assert.equal(status, 404);
});

test('classifyGraphqlErrors: mixed array containing FORBIDDEN (no NOT_FOUND) classified as 403', () => {
  const status = classifyGraphqlErrors([
    { type: 'INTERNAL', message: 'transient issue' },
    { type: 'FORBIDDEN', message: 'Resource not accessible' },
  ]);
  assert.equal(status, 403);
});

test('classifyGraphqlErrors: empty array does not throw and returns 502', () => {
  assert.doesNotThrow(() => classifyGraphqlErrors([]));
  assert.equal(classifyGraphqlErrors([]), 502);
});

test('classifyGraphqlErrors: null does not throw and returns 502', () => {
  assert.doesNotThrow(() => classifyGraphqlErrors(null));
  assert.equal(classifyGraphqlErrors(null), 502);
});

test('classifyGraphqlErrors: undefined does not throw and returns 502', () => {
  assert.doesNotThrow(() => classifyGraphqlErrors(undefined));
  assert.equal(classifyGraphqlErrors(undefined), 502);
});

test('classifyGraphqlErrors: malformed (non-array) input does not throw', () => {
  assert.doesNotThrow(() => classifyGraphqlErrors('not an array'));
  assert.doesNotThrow(() => classifyGraphqlErrors({ type: 'NOT_FOUND' }));
  assert.doesNotThrow(() => classifyGraphqlErrors(42));
});

test('classifyGraphqlErrors: array with malformed entries (null/non-object) does not throw', () => {
  assert.doesNotThrow(() => classifyGraphqlErrors([null, undefined, 'oops', 5]));
  assert.equal(classifyGraphqlErrors([null, undefined, 'oops', 5]), 502);
});

test('graphqlEndpoint: appends /graphql to a plain base url', () => {
  assert.equal(graphqlEndpoint('https://github.example.com/api'), 'https://github.example.com/api/graphql');
});

test('graphqlEndpoint: leaves an already-graphql url unchanged', () => {
  assert.equal(graphqlEndpoint('https://api.github.com/graphql'), 'https://api.github.com/graphql');
});

test('graphqlEndpoint: trims trailing slashes before checking', () => {
  assert.equal(graphqlEndpoint('https://api.github.com/graphql/'), 'https://api.github.com/graphql');
  assert.equal(graphqlEndpoint('https://github.example.com/api/'), 'https://github.example.com/api/graphql');
});

// --- buildRequestOptions ---------------------------------------------------

const SETTINGS = { base_url: 'https://api.github.com', pat_token: 'ghp_test' };

test('buildRequestOptions: no proxy env produces a plain direct request', () => {
  const { options, transport, proxyUrl } = buildRequestOptions('https://api.github.com/graphql', SETTINGS, {});
  assert.equal(proxyUrl, null);
  assert.equal(options.hostname, 'api.github.com');
  assert.equal(options.port, 443);
  assert.equal(options.path, '/graphql');
  assert.equal(options.agent, undefined);
  assert.equal(transport, require('https'));
});

test('buildRequestOptions: auth and content headers survive proxying', () => {
  const { options } = buildRequestOptions('https://api.github.com/graphql', SETTINGS, {
    HTTPS_PROXY: 'http://proxy.corp:8080',
  });
  assert.equal(options.headers.Authorization, 'Bearer ghp_test');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers['User-Agent'], 'manager-os');
});

test('buildRequestOptions: an https target through a proxy keeps its own host and gains a tunnel agent', () => {
  const { options, proxyUrl } = buildRequestOptions('https://api.github.com/graphql', SETTINGS, {
    HTTPS_PROXY: 'http://proxy.corp:8080',
  });
  assert.equal(proxyUrl.hostname, 'proxy.corp');
  // The request itself is still addressed to GitHub; the agent does the tunnelling.
  assert.equal(options.hostname, 'api.github.com');
  assert.equal(options.path, '/graphql');
  assert.ok(options.agent, 'expected a proxy agent');
});

test('buildRequestOptions: an http target through a proxy switches to absolute-form', () => {
  const settings = { base_url: 'http://ghes.corp/api', pat_token: 'ghp_test' };
  const { options, transport } = buildRequestOptions('http://ghes.corp/api/graphql', settings, {
    HTTP_PROXY: 'http://proxy.corp:8080',
  });
  assert.equal(options.hostname, 'proxy.corp');
  assert.equal(options.port, 8080);
  assert.equal(options.path, 'http://ghes.corp/api/graphql');
  assert.equal(options.headers.Host, 'ghes.corp');
  assert.equal(options.agent, undefined);
  assert.equal(transport, require('http'));
});

test('buildRequestOptions: NO_PROXY covering the target restores a direct request', () => {
  const { options, proxyUrl } = buildRequestOptions('https://api.github.com/graphql', SETTINGS, {
    HTTPS_PROXY: 'http://proxy.corp:8080',
    NO_PROXY: 'github.com',
  });
  assert.equal(proxyUrl, null);
  assert.equal(options.hostname, 'api.github.com');
  assert.equal(options.agent, undefined);
});

test('buildRequestOptions: a GHES endpoint on a custom port is preserved', () => {
  const settings = { base_url: 'https://ghes.corp:8443/api', pat_token: 'ghp_test' };
  const { options } = buildRequestOptions('https://ghes.corp:8443/api/graphql', settings, {});
  assert.equal(options.hostname, 'ghes.corp');
  assert.equal(options.port, '8443');
  assert.equal(options.path, '/api/graphql');
});
