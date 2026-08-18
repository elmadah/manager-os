const net = require('net');
const tls = require('tls');
const https = require('https');

// Node's http/https modules ignore HTTP_PROXY/HTTPS_PROXY entirely — unlike
// curl, git, or fetch under NODE_USE_ENV_PROXY. On a network where direct
// egress is blocked, that surfaces as `getaddrinfo ENOTFOUND api.github.com`,
// because the direct DNS lookup fails before any connection is attempted.
// This module adds the missing env-var handling for GitHub requests.
//
// TLS verification is left at the Node default throughout, matching the stance
// in githubClient.js: a proxy that MITMs TLS should be trusted by pointing
// NODE_EXTRA_CA_CERTS at its root CA, never by disabling verification.

const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 };

/**
 * Splits a NO_PROXY value into entries. Both commas and whitespace are
 * accepted as separators, which is what curl and the Go/Python ecosystems
 * all tolerate in practice.
 */
function parseNoProxy(noProxy) {
  return String(noProxy || '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Splits an optional `:port` suffix off a NO_PROXY entry.
 *
 * Bare IPv6 literals are full of colons, so a naive rsplit on ':' would read
 * the last hextet of `::1` as a port number. Only a bracketed `[::1]:8080`
 * or a single-colon `host:8080` is treated as carrying a port.
 */
function splitEntryPort(entry) {
  const bracketed = /^\[(.+)\]:(\d+)$/.exec(entry);
  if (bracketed) return { host: bracketed[1], port: bracketed[2] };
  if ((entry.match(/:/g) || []).length === 1) {
    const [host, port] = entry.split(':');
    if (/^\d+$/.test(port)) return { host, port };
  }
  return { host: entry, port: null };
}

/**
 * True when NO_PROXY says this host should be reached directly.
 *
 * `*` bypasses everything. A `.example.com` or `example.com` entry matches the
 * domain itself and any subdomain, which is the near-universal convention.
 */
function shouldBypassProxy(hostname, port, noProxy) {
  const entries = parseNoProxy(noProxy);
  if (entries.length === 0) return false;
  if (entries.includes('*')) return true;

  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return entries.some((entry) => {
    const split = splitEntryPort(entry);
    if (split.port && String(port) !== split.port) return false;
    const target = split.host.replace(/^\*?\./, '').replace(/^\[|\]$/g, '');
    if (!target) return false;
    return host === target || host.endsWith(`.${target}`);
  });
}

/**
 * A proxy given as `proxy.corp:8080` (no scheme) is common enough in corporate
 * setups that rejecting it would be user-hostile. Assume plain http.
 */
function withScheme(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
}

function invalidProxy(message) {
  const error = new Error(message);
  error.code = 'ERR_INVALID_PROXY_URL';
  return error;
}

/**
 * Resolves the proxy to use for `targetUrl`, or null to connect directly.
 *
 * Uppercase env vars win over lowercase, and ALL_PROXY is the fallback for
 * both schemes. A malformed proxy URL throws rather than silently falling back
 * to a direct connection — a typo'd proxy on a locked-down network would
 * otherwise resurface as the same opaque ENOTFOUND this module exists to fix.
 */
function selectProxy(targetUrl, env = process.env) {
  const url = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl));
  const isHttps = url.protocol === 'https:';
  const port = url.port || DEFAULT_PORTS[url.protocol];

  if (shouldBypassProxy(url.hostname, port, env.NO_PROXY || env.no_proxy)) {
    return null;
  }

  const raw = isHttps
    ? env.HTTPS_PROXY || env.https_proxy || env.ALL_PROXY || env.all_proxy
    : env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  if (!raw || !String(raw).trim()) return null;

  let proxyUrl;
  try {
    proxyUrl = new URL(withScheme(String(raw).trim()));
  } catch {
    throw invalidProxy(`Invalid proxy URL in environment: ${raw}`);
  }
  if (proxyUrl.protocol !== 'http:' && proxyUrl.protocol !== 'https:') {
    throw invalidProxy(
      `Unsupported proxy protocol "${proxyUrl.protocol}" in ${raw} (only http and https proxies are supported)`
    );
  }
  return proxyUrl;
}

function proxyAuthHeader(proxyUrl) {
  if (!proxyUrl.username && !proxyUrl.password) return null;
  const user = decodeURIComponent(proxyUrl.username);
  const pass = decodeURIComponent(proxyUrl.password);
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

/**
 * Extracts the auth schemes a 407 response is asking for.
 *
 * Which scheme the proxy demands decides whether this is fixable at all from
 * Node: Basic works with credentials in the proxy URL, whereas NTLM, Negotiate
 * and Kerberos need a handshake Node cannot perform, so the error has to say
 * which one it saw rather than blanket-advising credentials.
 */
function parseProxyAuthenticate(head) {
  return head
    .split(/\r\n/)
    .filter((line) => /^proxy-authenticate:/i.test(line))
    .map((line) => line.slice(line.indexOf(':') + 1).trim().split(/[\s,]+/)[0])
    .filter(Boolean);
}

function connectFailureHint(status, head) {
  if (status !== 407) return '';
  const schemes = parseProxyAuthenticate(head);
  if (schemes.length === 0) {
    return ' (proxy authentication required, but the proxy named no scheme — try credentials in the proxy URL: http://user:pass@host:port)';
  }
  const unsupported = schemes.filter((scheme) => !/^basic$/i.test(scheme));
  if (unsupported.length === schemes.length) {
    return (
      ` (proxy requires ${schemes.join('/')} authentication, which Node cannot perform;` +
      ' credentials in the proxy URL will not help — run a local authenticating relay such as cntlm or px,' +
      ' or ask IT for a proxy path that accepts Basic auth)'
    );
  }
  return ' (proxy authentication required — include credentials in the proxy URL: http://user:pass@host:port)';
}

/**
 * Opens a CONNECT tunnel through `proxyUrl` to host:port and hands the raw
 * tunnelled socket to the callback. The caller is responsible for any TLS
 * upgrade on top of it.
 */
function connectViaProxy(proxyUrl, host, port, timeoutMs, callback) {
  const secureProxy = proxyUrl.protocol === 'https:';
  const proxyPort = Number(proxyUrl.port) || DEFAULT_PORTS[proxyUrl.protocol];
  const proxyLabel = `${proxyUrl.hostname}:${proxyPort}`;

  const socket = secureProxy
    ? tls.connect({ host: proxyUrl.hostname, port: proxyPort, servername: proxyUrl.hostname })
    : net.connect({ host: proxyUrl.hostname, port: proxyPort });

  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    callback(err);
  };

  if (timeoutMs) {
    socket.setTimeout(timeoutMs, () => {
      fail(new Error(`Timed out establishing a proxy tunnel via ${proxyLabel} after ${timeoutMs}ms`));
    });
  }
  socket.once('error', (err) => {
    fail(new Error(`Could not reach the proxy at ${proxyLabel}: ${err.message}`));
  });
  // A proxy that hangs up mid-handshake emits 'close' with no 'error', which
  // would otherwise leave the callback pending forever.
  socket.once('close', () => {
    fail(new Error(`Proxy ${proxyLabel} closed the connection before completing the CONNECT tunnel`));
  });

  const onReady = () => {
    const target = `${host}:${port}`;
    const auth = proxyAuthHeader(proxyUrl);
    const lines = [`CONNECT ${target} HTTP/1.1`, `Host: ${target}`];
    if (auth) lines.push(`Proxy-Authorization: ${auth}`);
    lines.push('Proxy-Connection: keep-alive', '', '');
    socket.write(lines.join('\r\n'));

    let head = '';
    const onData = (chunk) => {
      head += chunk.toString('latin1');
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) {
        // A proxy that streams an unbounded body without ever terminating the
        // header block would otherwise buffer without limit.
        if (head.length > 16384) fail(new Error(`Malformed CONNECT response from proxy ${proxyLabel}`));
        return;
      }
      socket.removeListener('data', onData);

      const statusLine = head.slice(0, head.indexOf('\r\n'));
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(statusLine)?.[1]);
      if (status !== 200) {
        return fail(
          new Error(
            `Proxy ${proxyLabel} refused CONNECT to ${target}: ${statusLine.trim()}${connectFailureHint(status, head)}`
          )
        );
      }

      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.removeAllListeners('error');
      socket.removeAllListeners('timeout');
      socket.removeAllListeners('close');
      callback(null, socket);
    };
    socket.on('data', onData);
  };

  socket.once(secureProxy ? 'secureConnect' : 'connect', onReady);
}

/**
 * An https.Agent that reaches its target through an HTTP CONNECT tunnel.
 */
class HttpsProxyAgent extends https.Agent {
  constructor(proxyUrl, options = {}) {
    const { tunnelTimeout, ...agentOptions } = options;
    super(agentOptions);
    this.proxyUrl = proxyUrl;
    this.tunnelTimeout = tunnelTimeout;
  }

  createConnection(options, callback) {
    const host = options.host;
    const port = options.port || DEFAULT_PORTS['https:'];
    connectViaProxy(this.proxyUrl, host, port, this.tunnelTimeout, (err, socket) => {
      if (err) return callback(err);
      const tlsSocket = tls.connect({
        ...options,
        host: undefined,
        port: undefined,
        path: undefined,
        socket,
        servername: options.servername || host,
      });
      tlsSocket.once('error', () => socket.destroy());
      callback(null, tlsSocket);
    });
  }
}

function createProxyAgent(proxyUrl, { tunnelTimeout } = {}) {
  return new HttpsProxyAgent(proxyUrl, { tunnelTimeout });
}

/**
 * Plain-http targets don't use CONNECT: the request goes to the proxy itself
 * with an absolute-form request line. Returns the request-option overrides
 * that turn a direct request into a proxied one.
 */
function httpProxyRequestOptions(proxyUrl, targetUrl) {
  const url = targetUrl instanceof URL ? targetUrl : new URL(String(targetUrl));
  const headers = { Host: url.host };
  const auth = proxyAuthHeader(proxyUrl);
  if (auth) headers['Proxy-Authorization'] = auth;
  return {
    hostname: proxyUrl.hostname,
    port: Number(proxyUrl.port) || DEFAULT_PORTS[proxyUrl.protocol],
    path: url.toString(),
    headers,
  };
}

module.exports = {
  selectProxy,
  parseProxyAuthenticate,
  connectFailureHint,
  shouldBypassProxy,
  createProxyAgent,
  httpProxyRequestOptions,
  connectViaProxy,
};
