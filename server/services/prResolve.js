const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * Extract a Jira issue key from a PR title, falling back to its branch name.
 * Title wins because branches get renamed while titles are curated.
 */
function parseJiraKey(title, headBranch) {
  for (const source of [title, headBranch]) {
    if (!source) continue;
    const match = String(source).match(JIRA_KEY_RE);
    if (match) return match[1];
  }
  return null;
}

/**
 * Attribute a PR to a sprint. Order: the linked story's sprint, then the
 * capacity plan whose date window contains the merge date (or the creation
 * date for still-open PRs). Overlapping windows resolve to the later start.
 */
function resolveSprint({ story, plans, mergedAt, createdAt }) {
  if (story && story.sprint) {
    return { sprint: story.sprint, source: 'story' };
  }

  const stamp = mergedAt || createdAt;
  if (!stamp) return { sprint: null, source: 'none' };
  const day = String(stamp).slice(0, 10);

  const matches = (plans || []).filter(
    (p) => p.jira_sprint_name && p.start_date <= day && day <= p.end_date
  );
  if (matches.length === 0) return { sprint: null, source: 'none' };

  matches.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return { sprint: matches[0].jira_sprint_name, source: 'date_window' };
}

/** Earliest review timestamp, excluding the PR author's own reviews. */
function firstReviewAt(reviews, authorLogin) {
  const stamps = (reviews || [])
    .filter((r) => r.submitted_at && r.author_login !== authorLogin)
    .map((r) => r.submitted_at)
    .sort();
  return stamps.length ? stamps[0] : null;
}

module.exports = { parseJiraKey, resolveSprint, firstReviewAt };
