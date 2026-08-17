const https = require('https');
const http = require('http');

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

function graphql(settings, query, variables) {
  const endpoint = graphqlEndpoint(settings.base_url);
  const parsed = new URL(endpoint);
  const transport = parsed.protocol === 'https:' ? https : http;
  const payload = JSON.stringify({ query, variables });

  return new Promise((resolve, reject) => {
    const req = transport.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.pat_token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'manager-os',
          Accept: 'application/json',
        },
      },
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

module.exports = { graphql, fetchPullRequestPage, graphqlEndpoint, classifyGraphqlErrors };
