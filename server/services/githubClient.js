const https = require('https');
const http = require('http');

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
            error.status = 200;
            return reject(error);
          }
          resolve(json.data);
        });
      }
    );
    req.on('error', reject);
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

module.exports = { graphql, fetchPullRequestPage, graphqlEndpoint };
