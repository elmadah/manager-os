const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

/**
 * Extract a Jira issue key from a PR title, falling back to its branch name.
 * Title wins because branches get renamed while titles are curated.
 *
 * knownPrefixes (optional iterable of real Jira project keys, e.g. ['PAY',
 * 'OPS']) disambiguates real keys from lookalike tokens such as UTF-8,
 * ISO-8601, or SHA-256. When it's non-empty, every regex match in the title
 * then the branch is scanned in order and the first one whose prefix is
 * known wins; if none qualify, the result is null rather than a guess.
 * When knownPrefixes is empty/absent, the original behavior is preserved:
 * the first match in the title, else the first in the branch, else null.
 */
function parseJiraKey(title, headBranch, knownPrefixes) {
  const known = knownPrefixes ? new Set(knownPrefixes) : null;

  for (const source of [title, headBranch]) {
    if (!source) continue;
    const matches = String(source).matchAll(JIRA_KEY_RE);
    for (const match of matches) {
      const key = match[1];
      if (!known || known.size === 0) return key;
      const prefix = key.slice(0, key.lastIndexOf('-'));
      if (known.has(prefix)) return key;
    }
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
  // GitHub timestamps are always UTC (ISO 8601 with a Z suffix), so slicing
  // the first 10 characters gives the correct UTC calendar date directly.
  const day = String(stamp).slice(0, 10);

  const matches = (plans || []).filter(
    (p) => p && p.jira_sprint_name && p.start_date <= day && day <= p.end_date
  );
  if (matches.length === 0) return { sprint: null, source: 'none' };

  matches.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  return { sprint: matches[0].jira_sprint_name, source: 'date_window' };
}

/** Earliest review timestamp, excluding the PR author's own reviews. */
function firstReviewAt(reviews, authorLogin) {
  const stamps = (reviews || [])
    .filter((r) => r && r.submitted_at && r.author_login !== authorLogin)
    .map((r) => r.submitted_at)
    .sort();
  return stamps.length ? stamps[0] : null;
}

module.exports = { parseJiraKey, resolveSprint, firstReviewAt };
