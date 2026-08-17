const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyGraphqlErrors, graphqlEndpoint } = require('./githubClient');

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
