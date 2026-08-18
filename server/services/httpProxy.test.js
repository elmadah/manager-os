const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  selectProxy,
  shouldBypassProxy,
  createProxyAgent,
  httpProxyRequestOptions,
  parseProxyAuthenticate,
  connectFailureHint,
} = require('./httpProxy');

// --- selectProxy -----------------------------------------------------------

test('selectProxy: no proxy vars means a direct connection', () => {
  assert.equal(selectProxy('https://api.github.com/graphql', {}), null);
});

test('selectProxy: HTTPS_PROXY is used for https targets', () => {
  const proxy = selectProxy('https://api.github.com/graphql', { HTTPS_PROXY: 'http://proxy.corp:8080' });
  assert.equal(proxy.hostname, 'proxy.corp');
  assert.equal(proxy.port, '8080');
});

test('selectProxy: HTTP_PROXY is not used for https targets', () => {
  assert.equal(selectProxy('https://api.github.com/graphql', { HTTP_PROXY: 'http://proxy.corp:8080' }), null);
});

test('selectProxy: HTTP_PROXY is used for http targets', () => {
  const proxy = selectProxy('http://ghes.corp/api/graphql', { HTTP_PROXY: 'http://proxy.corp:8080' });
  assert.equal(proxy.hostname, 'proxy.corp');
});

test('selectProxy: uppercase wins over lowercase', () => {
  const proxy = selectProxy('https://api.github.com/graphql', {
    HTTPS_PROXY: 'http://upper.corp:8080',
    https_proxy: 'http://lower.corp:8080',
  });
  assert.equal(proxy.hostname, 'upper.corp');
});

test('selectProxy: ALL_PROXY is the fallback for both schemes', () => {
  assert.equal(selectProxy('https://api.github.com/graphql', { ALL_PROXY: 'http://all.corp:8080' }).hostname, 'all.corp');
  assert.equal(selectProxy('http://ghes.corp/api/graphql', { ALL_PROXY: 'http://all.corp:8080' }).hostname, 'all.corp');
});

test('selectProxy: a scheme-less proxy value is assumed to be http', () => {
  const proxy = selectProxy('https://api.github.com/graphql', { HTTPS_PROXY: 'proxy.corp:8080' });
  assert.equal(proxy.protocol, 'http:');
  assert.equal(proxy.hostname, 'proxy.corp');
  assert.equal(proxy.port, '8080');
});

test('selectProxy: an empty or whitespace proxy value means direct', () => {
  assert.equal(selectProxy('https://api.github.com/graphql', { HTTPS_PROXY: '' }), null);
  assert.equal(selectProxy('https://api.github.com/graphql', { HTTPS_PROXY: '   ' }), null);
});

test('selectProxy: an unsupported proxy scheme throws rather than silently going direct', () => {
  assert.throws(
    () => selectProxy('https://api.github.com/graphql', { HTTPS_PROXY: 'socks5://proxy.corp:1080' }),
    /Unsupported proxy protocol/
  );
});

test('selectProxy: NO_PROXY suppresses the proxy for a matching host', () => {
  const env = { HTTPS_PROXY: 'http://proxy.corp:8080', NO_PROXY: 'github.com' };
  assert.equal(selectProxy('https://api.github.com/graphql', env), null);
});

test('selectProxy: NO_PROXY leaves non-matching hosts proxied', () => {
  const env = { HTTPS_PROXY: 'http://proxy.corp:8080', NO_PROXY: 'internal.corp' };
  assert.equal(selectProxy('https://api.github.com/graphql', env).hostname, 'proxy.corp');
});

// --- shouldBypassProxy -----------------------------------------------------

test('shouldBypassProxy: empty NO_PROXY bypasses nothing', () => {
  assert.equal(shouldBypassProxy('api.github.com', '443', ''), false);
  assert.equal(shouldBypassProxy('api.github.com', '443', undefined), false);
  // VS Code's `http.noProxy: []` serialises to nothing to bypass.
  assert.equal(shouldBypassProxy('api.github.com', '443', []), false);
});

test('shouldBypassProxy: "*" bypasses everything', () => {
  assert.equal(shouldBypassProxy('api.github.com', '443', '*'), true);
});

test('shouldBypassProxy: a bare domain matches its subdomains', () => {
  assert.equal(shouldBypassProxy('api.github.com', '443', 'github.com'), true);
  assert.equal(shouldBypassProxy('github.com', '443', 'github.com'), true);
});

test('shouldBypassProxy: a leading dot or star is tolerated', () => {
  assert.equal(shouldBypassProxy('api.github.com', '443', '.github.com'), true);
  assert.equal(shouldBypassProxy('api.github.com', '443', '*.github.com'), true);
});

test('shouldBypassProxy: does not match a suffix that is not a domain boundary', () => {
  assert.equal(shouldBypassProxy('notgithub.com', '443', 'github.com'), false);
  assert.equal(shouldBypassProxy('api.github.com.evil.co', '443', 'github.com'), false);
});

test('shouldBypassProxy: comma and whitespace separated lists both parse', () => {
  assert.equal(shouldBypassProxy('api.github.com', '443', 'a.com, github.com ,b.com'), true);
  assert.equal(shouldBypassProxy('api.github.com', '443', 'a.com github.com b.com'), true);
});

test('shouldBypassProxy: matching is case insensitive', () => {
  assert.equal(shouldBypassProxy('API.GitHub.com', '443', 'github.com'), true);
});

test('shouldBypassProxy: a port-qualified entry only matches that port', () => {
  assert.equal(shouldBypassProxy('ghes.corp', '8443', 'ghes.corp:8443'), true);
  assert.equal(shouldBypassProxy('ghes.corp', '443', 'ghes.corp:8443'), false);
});

test('shouldBypassProxy: a bare IPv6 literal is not mistaken for a host:port pair', () => {
  // Naive rsplit on ":" would read "1" as the port and "::" as the host.
  assert.equal(shouldBypassProxy('::1', '443', '::1'), true);
  assert.equal(shouldBypassProxy('[::1]', '8080', '[::1]:8080'), true);
  assert.equal(shouldBypassProxy('[::1]', '443', '[::1]:8080'), false);
});

// --- httpProxyRequestOptions ----------------------------------------------

test('httpProxyRequestOptions: rewrites an http request into absolute form', () => {
  const opts = httpProxyRequestOptions(new URL('http://proxy.corp:8080'), 'http://ghes.corp/api/graphql');
  assert.equal(opts.hostname, 'proxy.corp');
  assert.equal(opts.port, 8080);
  assert.equal(opts.path, 'http://ghes.corp/api/graphql');
  assert.equal(opts.headers.Host, 'ghes.corp');
});

test('httpProxyRequestOptions: credentials become a Proxy-Authorization header', () => {
  const opts = httpProxyRequestOptions(new URL('http://bob:s3cr3t@proxy.corp:8080'), 'http://ghes.corp/api/graphql');
  assert.equal(opts.headers['Proxy-Authorization'], `Basic ${Buffer.from('bob:s3cr3t').toString('base64')}`);
});

test('httpProxyRequestOptions: no credentials means no Proxy-Authorization header', () => {
  const opts = httpProxyRequestOptions(new URL('http://proxy.corp:8080'), 'http://ghes.corp/api/graphql');
  assert.equal('Proxy-Authorization' in opts.headers, false);
});

test('httpProxyRequestOptions: a proxy with no explicit port defaults by scheme', () => {
  assert.equal(httpProxyRequestOptions(new URL('http://proxy.corp'), 'http://ghes.corp/x').port, 80);
  assert.equal(httpProxyRequestOptions(new URL('https://proxy.corp'), 'http://ghes.corp/x').port, 443);
});

// --- CONNECT tunnelling (against a real local proxy) -----------------------

function withProxy(handler, run) {
  return new Promise((resolve, reject) => {
    const proxy = http.createServer();
    proxy.on('connect', handler);
    proxy.on('error', reject);
    proxy.listen(0, '127.0.0.1', () => {
      const done = (err) => proxy.close(() => (err ? reject(err) : resolve()));
      Promise.resolve(run(proxy.address().port)).then(() => done(), done);
    });
  });
}

test('createProxyAgent: issues a CONNECT to the target host and port', async () => {
  let seen = null;
  await withProxy(
    (req, socket) => {
      seen = { url: req.url, auth: req.headers['proxy-authorization'], host: req.headers.host };
      socket.end();
    },
    async (port) => {
      const agent = createProxyAgent(new URL(`http://127.0.0.1:${port}`), { tunnelTimeout: 5000 });
      await new Promise((resolve) => {
        const req = require('https').request(
          { hostname: 'api.github.com', port: 443, path: '/graphql', method: 'POST', agent },
          () => resolve()
        );
        req.on('error', () => resolve());
        req.end();
      });
      assert.equal(seen.url, 'api.github.com:443');
      assert.equal(seen.host, 'api.github.com:443');
      assert.equal(seen.auth, undefined);
    }
  );
});

test('createProxyAgent: sends Proxy-Authorization when the proxy URL carries credentials', async () => {
  let seen = null;
  await withProxy(
    (req, socket) => {
      seen = req.headers['proxy-authorization'];
      socket.end();
    },
    async (port) => {
      const agent = createProxyAgent(new URL(`http://bob:s3cr3t@127.0.0.1:${port}`), { tunnelTimeout: 5000 });
      await new Promise((resolve) => {
        const req = require('https').request(
          { hostname: 'api.github.com', port: 443, path: '/graphql', method: 'POST', agent },
          () => resolve()
        );
        req.on('error', () => resolve());
        req.end();
      });
      assert.equal(seen, `Basic ${Buffer.from('bob:s3cr3t').toString('base64')}`);
    }
  );
});

test('createProxyAgent: a 407 from the proxy surfaces an actionable error', async () => {
  await withProxy(
    (req, socket) => {
      socket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      socket.end();
    },
    async (port) => {
      const agent = createProxyAgent(new URL(`http://127.0.0.1:${port}`), { tunnelTimeout: 5000 });
      const err = await new Promise((resolve) => {
        const req = require('https').request(
          { hostname: 'api.github.com', port: 443, path: '/graphql', method: 'POST', agent },
          () => resolve(null)
        );
        req.on('error', resolve);
        req.end();
      });
      assert.match(err.message, /refused CONNECT/);
      assert.match(err.message, /407/);
      assert.match(err.message, /proxy authentication required/i);
    }
  );
});

test('createProxyAgent: an unreachable proxy names the proxy rather than the target', async () => {
  // Port 1 on loopback has nothing listening, so this fails fast.
  const agent = createProxyAgent(new URL('http://127.0.0.1:1'), { tunnelTimeout: 5000 });
  const err = await new Promise((resolve) => {
    const req = require('https').request(
      { hostname: 'api.github.com', port: 443, path: '/graphql', method: 'POST', agent },
      () => resolve(null)
    );
    req.on('error', resolve);
    req.end();
  });
  assert.match(err.message, /Could not reach the proxy at 127\.0\.0\.1:1/);
});

// --- 407 scheme detection --------------------------------------------------

const head407 = (headers) => `HTTP/1.1 407 Proxy Authentication Required\r\n${headers}\r\n\r\n`;

test('parseProxyAuthenticate: extracts the scheme, dropping realm parameters', () => {
  assert.deepEqual(parseProxyAuthenticate(head407('Proxy-Authenticate: Basic realm="corp"')), ['Basic']);
});

test('parseProxyAuthenticate: collects every offered scheme', () => {
  const head = head407('Proxy-Authenticate: Negotiate\r\nProxy-Authenticate: NTLM');
  assert.deepEqual(parseProxyAuthenticate(head), ['Negotiate', 'NTLM']);
});

test('parseProxyAuthenticate: header matching is case insensitive', () => {
  assert.deepEqual(parseProxyAuthenticate(head407('proxy-authenticate: basic')), ['basic']);
});

test('parseProxyAuthenticate: no such header yields no schemes', () => {
  assert.deepEqual(parseProxyAuthenticate(head407('Via: 1.1 corp')), []);
});

test('connectFailureHint: Basic advises credentials in the proxy URL', () => {
  assert.match(connectFailureHint(407, head407('Proxy-Authenticate: Basic realm="corp"')), /credentials in the proxy URL/);
});

test('connectFailureHint: NTLM-only says credentials will not help', () => {
  const hint = connectFailureHint(407, head407('Proxy-Authenticate: NTLM'));
  assert.match(hint, /NTLM/);
  assert.match(hint, /will not help/);
  assert.match(hint, /cntlm|px/);
});

test('connectFailureHint: a Basic option alongside NTLM is still actionable', () => {
  const hint = connectFailureHint(407, head407('Proxy-Authenticate: Negotiate\r\nProxy-Authenticate: Basic realm="x"'));
  assert.match(hint, /credentials in the proxy URL/);
  assert.doesNotMatch(hint, /will not help/);
});

test('connectFailureHint: a 407 naming no scheme still suggests something', () => {
  assert.match(connectFailureHint(407, head407('Via: 1.1 corp')), /named no scheme/);
});

test('connectFailureHint: non-407 statuses get no hint', () => {
  assert.equal(connectFailureHint(403, head407('Proxy-Authenticate: Basic')), '');
  assert.equal(connectFailureHint(502, ''), '');
});

test('createProxyAgent: a 407 error reports the scheme the proxy asked for', async () => {
  await withProxy(
    (req, socket) => {
      socket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: NTLM\r\n\r\n');
      socket.end();
    },
    async (port) => {
      const agent = createProxyAgent(new URL(`http://127.0.0.1:${port}`), { tunnelTimeout: 5000 });
      const err = await new Promise((resolve) => {
        const req = require('https').request(
          { hostname: 'api.github.com', port: 443, path: '/graphql', method: 'POST', agent },
          () => resolve(null)
        );
        req.on('error', resolve);
        req.end();
      });
      assert.match(err.message, /NTLM/);
      assert.match(err.message, /will not help/);
    }
  );
});
