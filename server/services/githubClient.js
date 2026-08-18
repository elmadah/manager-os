const https = require('https');
const http = require('http');
const { selectProxy, createProxyAgent, httpProxyRequestOptions } = require('./httpProxy');

// TLS verification is intentionally left on (the Node default) for GitHub
// requests, unlike server/routes/jiraSettings.js which disables it with
// rejectUnauthorized: false. That divergence is deliberate: for GitHub
// Enterprise Server behind an internal CA, the correct fix is to trust that
// CA via the NODE_EXTRA_CA_CERTS environment variable, not to disable
// certificate verification.

const REQUEST_TIMEOUT_MS = 30000;

const PR_PAGE_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state isDraft
        createdAt mergedAt closedAt updatedAt
        additions deletions changedFiles
        author { login }
        baseRefName headRefName
        reviews(first: 20) { nodes { author { login } state submittedAt } }
      }
    }
  }
}`;

/**
 * GitHub cloud uses https://api.github.com/graphql; GHES uses
 * https://host/api/graphql. Accept either form of base_url.
 */
function graphqlEndpoint(baseUrl) {
  const trimmed = String(baseUrl).replace(/\/+$/, '');
  return trimmed.endsWith('/graphql') ? trimmed : `${trimmed}/graphql`;
}

/**
 * Maps a GitHub GraphQL `errors` array to an HTTP-like status code so
 * callers can distinguish failure modes (e.g. a missing/inaccessible repo
 * vs. a bad token) without inspecting error messages themselves.
 *
 * GitHub returns HTTP 200 with a populated `errors` array for GraphQL-level
 * failures such as a missing repository, so this classification is what
 * lets fetchPullRequestPage's 404 backstop actually be reachable in
 * practice, and lets a sync loop decide whether to abort entirely (401) or
 * skip just one repo (404).
 */
function classifyGraphqlErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 502;
  }
  const types = errors
    .filter((e) => e && typeof e === 'object')
    .map((e) => e.type);
  if (types.includes('NOT_FOUND')) return 404;
  if (types.includes('FORBIDDEN')) return 403;
  return 502;
}

/**
 * Builds the request options for one GraphQL POST, routing through
 * HTTPS_PROXY/HTTP_PROXY when the environment asks for it (see httpProxy.js —
 * Node does not honour those variables on its own).
 */
function buildRequestOptions(endpoint, settings, env) {
  const parsed = new URL(endpoint);
  const isHttps = parsed.protocol === 'https:';
  const options = {
    method: 'POST',
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    headers: {
      Authorization: `Bearer ${settings.pat_token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'manager-os',
      Accept: 'application/json',
    },
  };

  const proxyUrl = selectProxy(parsed, env);
  if (!proxyUrl) return { options, transport: isHttps ? https : http, proxyUrl: null };

  if (isHttps) {
    // https targets are tunnelled with CONNECT so TLS stays end-to-end.
    options.agent = createProxyAgent(proxyUrl, { tunnelTimeout: REQUEST_TIMEOUT_MS });
    return { options, transport: https, proxyUrl };
  }

  // http targets go to the proxy directly in absolute-form.
  const overrides = httpProxyRequestOptions(proxyUrl, parsed);
  options.hostname = overrides.hostname;
  options.port = overrides.port;
  options.path = overrides.path;
  Object.assign(options.headers, overrides.headers);
  return { options, transport: http, proxyUrl };
}

function graphql(settings, query, variables, env = process.env) {
  const endpoint = graphqlEndpoint(settings.base_url);
  const payload = JSON.stringify({ query, variables });
  const { options, transport } = buildRequestOptions(endpoint, settings, env);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      options,
      (res) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(
              `GitHub API error: ${res.statusCode} ${res.statusMessage}`
            );
            error.status = res.statusCode;
            if (res.statusCode === 403 && res.headers['x-ratelimit-reset']) {
              error.rateLimitReset = Number(res.headers['x-ratelimit-reset']);
            }
            return reject(error);
          }
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            return reject(new Error('Invalid JSON response from GitHub'));
          }
          if (json.errors && json.errors.length) {
            const error = new Error(json.errors.map((e) => e.message).join('; '));
            error.status = classifyGraphqlErrors(json.errors);
            error.graphqlErrors = json.errors;
            return reject(error);
          }
          resolve(json.data);
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      const error = new Error(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      error.status = 504;
      reject(error);
    });
    req.write(payload);
    req.end();
  });
}

async function fetchPullRequestPage(settings, { owner, name, cursor }) {
  const data = await graphql(settings, PR_PAGE_QUERY, { owner, name, cursor: cursor || null });
  if (!data || !data.repository) {
    const error = new Error(`Repository not found: ${owner}/${name}`);
    error.status = 404;
    throw error;
  }
  const page = data.repository.pullRequests;
  return {
    nodes: page.nodes || [],
    hasNextPage: page.pageInfo.hasNextPage,
    endCursor: page.pageInfo.endCursor,
  };
}

module.exports = {
  graphql,
  fetchPullRequestPage,
  graphqlEndpoint,
  classifyGraphqlErrors,
  buildRequestOptions,
};
