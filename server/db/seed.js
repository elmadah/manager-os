const fs = require('fs');
const path = require('path');
const db = require('./init');

async function seed() {
  await db.init();

  // Clear existing data
  const tables = [
    'story_sprint_history', 'stories', 'one_on_ones', 'blockers',
    'todos', 'notes', 'features', 'team_members', 'projects'
  ];
  for (const t of tables) {
    db.exec(`DELETE FROM ${t}`);
  }

  console.log('Cleared existing data.');

  // --- Projects ---
  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, status, health, color, start_date, target_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const projects = [
    ['Checkout Redesign', 'Complete overhaul of the checkout flow to reduce cart abandonment and improve conversion rates', 'active', 'green', '#3B82F6', '2026-01-12', '2026-04-30'],
    ['Mobile App v2', 'Major update to the mobile app with new navigation, offline support, and performance improvements', 'active', 'yellow', '#F59E0B', '2026-02-03', '2026-06-15'],
    ['API Gateway Migration', 'Migrate from monolithic API to microservices-based API gateway with improved rate limiting and auth', 'planning', 'green', '#10B981', '2026-03-20', '2026-08-01'],
  ];

  const projectIds = projects.map(p => insertProject.run(...p).lastInsertRowid);
  console.log(`Inserted ${projectIds.length} projects.`);

  // --- Features ---
  const insertFeature = db.prepare(`
    INSERT INTO features (project_id, name, description, status, priority, start_date, target_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const features = [
    // Checkout Redesign
    [projectIds[0], 'Payment Processing', 'Integrate Stripe v3, Apple Pay, and Google Pay with PCI-compliant tokenization', 'in_progress', 'high', '2026-01-20', '2026-03-15'],
    [projectIds[0], 'Cart UI', 'Redesigned cart with real-time price updates, saved items, and quantity controls', 'in_progress', 'high', '2026-01-15', '2026-03-01'],
    [projectIds[0], 'Order Tracking', 'Post-purchase order tracking page with real-time shipping updates via webhook integration', 'not_started', 'medium', '2026-03-16', '2026-04-30'],
    // Mobile App v2
    [projectIds[1], 'Push Notifications', 'Rich push notification system with deep linking, quiet hours, and preference center', 'in_progress', 'high', '2026-02-10', '2026-04-01'],
    [projectIds[1], 'Offline Mode', 'Local-first data sync with conflict resolution for core user flows', 'not_started', 'medium', '2026-04-01', '2026-05-30'],
    [projectIds[1], 'App Performance', 'Reduce cold start time by 40%, optimize image loading, and reduce bundle size', 'in_progress', 'high', '2026-02-10', '2026-03-31'],
    // API Gateway Migration
    [projectIds[2], 'Auth Service', 'Extract authentication into standalone service with OAuth2 and JWT token management', 'not_started', 'high', '2026-03-20', '2026-05-15'],
    [projectIds[2], 'Rate Limiting', 'Implement distributed rate limiting with Redis, per-tenant quotas, and graceful degradation', 'not_started', 'medium', '2026-05-01', '2026-06-30'],
  ];

  const featureIds = features.map(f => insertFeature.run(...f).lastInsertRowid);
  console.log(`Inserted ${featureIds.length} features.`);

  // --- Team Members ---
  const insertMember = db.prepare(`
    INSERT INTO team_members (name, role, email) VALUES (?, ?, ?)
  `);

  const members = [
    ['Sarah Chen', 'Senior Frontend Engineer', 'sarah.chen@company.com'],
    ['Marcus Johnson', 'Backend Engineer', 'marcus.johnson@company.com'],
    ['Priya Patel', 'QA Engineer', 'priya.patel@company.com'],
    ['David Kim', 'Full Stack Engineer', 'david.kim@company.com'],
    ['Elena Rodriguez', 'Senior Backend Engineer', 'elena.rodriguez@company.com'],
    ['James O\'Brien', 'iOS Engineer', 'james.obrien@company.com'],
    ['Aisha Thompson', 'Product Designer', 'aisha.thompson@company.com'],
    ['Ryan Nakamura', 'DevOps Engineer', 'ryan.nakamura@company.com'],
  ];

  const memberIds = members.map(m => insertMember.run(...m).lastInsertRowid);
  console.log(`Inserted ${memberIds.length} team members.`);

  // --- Stories ---
  const insertStory = db.prepare(`
    INSERT INTO stories (key, summary, sprint, status, assignee_id, feature_id, story_points, release_date, first_seen_sprint, carry_over_count, sprints_to_complete)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const currentSprint = 'Sprint 25';
  const stories = [
    // Payment Processing (feature 0)
    ['CHKOUT-101', 'Integrate Stripe v3 SDK and create payment intent flow', 'Sprint 24', 'Done', memberIds[1], featureIds[0], 5, '2026-03-01', 'Sprint 23', 1, 2],
    ['CHKOUT-102', 'Add Apple Pay button and payment sheet integration', currentSprint, 'In Progress', memberIds[0], featureIds[0], 3, null, currentSprint, 0, null],
    ['CHKOUT-103', 'Implement Google Pay web payments API', currentSprint, 'To Do', memberIds[0], featureIds[0], 3, null, currentSprint, 0, null],
    ['CHKOUT-104', 'PCI compliance audit and token storage review', currentSprint, 'To Do', memberIds[4], featureIds[0], 2, null, currentSprint, 0, null],
    ['CHKOUT-105', 'Payment error handling and retry logic', currentSprint, 'In Progress', memberIds[1], featureIds[0], 3, null, 'Sprint 24', 1, null],

    // Cart UI (feature 1)
    ['CHKOUT-201', 'Cart page responsive layout with product cards', 'Sprint 23', 'Done', memberIds[0], featureIds[1], 5, '2026-02-15', 'Sprint 22', 1, 2],
    ['CHKOUT-202', 'Real-time price calculation with tax and shipping', 'Sprint 24', 'Done', memberIds[3], featureIds[1], 3, '2026-03-01', 'Sprint 24', 0, 1],
    ['CHKOUT-203', 'Saved items / wishlist functionality', currentSprint, 'In Progress', memberIds[3], featureIds[1], 5, null, currentSprint, 0, null],
    ['CHKOUT-204', 'Quantity selector with stock validation', 'Sprint 24', 'Done', memberIds[0], featureIds[1], 2, '2026-03-01', 'Sprint 24', 0, 1],
    ['CHKOUT-205', 'Cart empty state and upsell recommendations', currentSprint, 'To Do', memberIds[6], featureIds[1], 3, null, currentSprint, 0, null],

    // Order Tracking (feature 2)
    ['CHKOUT-301', 'Order status page UI with timeline component', currentSprint, 'To Do', memberIds[0], featureIds[2], 5, null, currentSprint, 0, null],
    ['CHKOUT-302', 'Shipping webhook integration (FedEx, UPS, USPS)', null, 'Backlog', null, featureIds[2], 8, null, null, 0, null],

    // Push Notifications (feature 3)
    ['MOB-101', 'Firebase Cloud Messaging setup and device registration', 'Sprint 24', 'Done', memberIds[5], featureIds[3], 3, '2026-03-01', 'Sprint 23', 1, 2],
    ['MOB-102', 'Rich notification templates with image support', currentSprint, 'In Review', memberIds[5], featureIds[3], 5, null, 'Sprint 24', 1, null],
    ['MOB-103', 'Deep linking from notification tap to in-app screens', currentSprint, 'In Progress', memberIds[5], featureIds[3], 5, null, currentSprint, 0, null],
    ['MOB-104', 'Notification preference center UI', currentSprint, 'To Do', memberIds[6], featureIds[3], 3, null, currentSprint, 0, null],

    // Offline Mode (feature 4)
    ['MOB-201', 'Local SQLite database schema and sync protocol design', null, 'Backlog', null, featureIds[4], 8, null, null, 0, null],
    ['MOB-202', 'Conflict resolution strategy document', null, 'Backlog', memberIds[4], featureIds[4], 3, null, null, 0, null],

    // App Performance (feature 5)
    ['MOB-301', 'Profile cold start and identify bottlenecks', 'Sprint 23', 'Done', memberIds[5], featureIds[5], 3, '2026-02-15', 'Sprint 23', 0, 1],
    ['MOB-302', 'Implement lazy loading for non-critical modules', 'Sprint 24', 'Done', memberIds[3], featureIds[5], 5, '2026-03-01', 'Sprint 24', 0, 1],
    ['MOB-303', 'Image optimization pipeline with WebP conversion', currentSprint, 'In Progress', memberIds[3], featureIds[5], 3, null, currentSprint, 0, null],
    ['MOB-304', 'Bundle size analysis and tree-shaking improvements', currentSprint, 'To Do', memberIds[5], featureIds[5], 2, null, currentSprint, 0, null],

    // Auth Service (feature 6)
    ['APIGW-101', 'Auth service architecture and API contract design', null, 'Backlog', memberIds[4], featureIds[6], 5, null, null, 0, null],
    ['APIGW-102', 'OAuth2 authorization code flow implementation', null, 'Backlog', null, featureIds[6], 8, null, null, 0, null],
    ['APIGW-103', 'JWT token issuance and rotation', null, 'Backlog', null, featureIds[6], 5, null, null, 0, null],

    // Rate Limiting (feature 7)
    ['APIGW-201', 'Redis-based sliding window rate limiter', null, 'Backlog', null, featureIds[7], 5, null, null, 0, null],
    ['APIGW-202', 'Per-tenant quota configuration and dashboard', null, 'Backlog', null, featureIds[7], 5, null, null, 0, null],
  ];

  const storyIds = stories.map(s => insertStory.run(...s).lastInsertRowid);
  console.log(`Inserted ${storyIds.length} stories.`);

  // --- Sprint History ---
  const insertHistory = db.prepare(`
    INSERT INTO story_sprint_history (story_id, sprint, status, assignee_id, imported_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const sprintHistory = [
    // CHKOUT-101: carried over from Sprint 23 to Sprint 24
    [storyIds[0], 'Sprint 21', 'To Do', null, '2026-01-19'],
    [storyIds[0], 'Sprint 22', 'To Do', memberIds[1], '2026-01-26'],
    [storyIds[0], 'Sprint 23', 'In Progress', memberIds[1], '2026-02-02'],
    [storyIds[0], 'Sprint 24', 'Done', memberIds[1], '2026-02-16'],

    // CHKOUT-105: carried over from Sprint 24
    [storyIds[4], 'Sprint 24', 'In Progress', memberIds[1], '2026-02-16'],
    [storyIds[4], currentSprint, 'In Progress', memberIds[1], '2026-03-02'],

    // CHKOUT-201: carried over from Sprint 22 to Sprint 23
    [storyIds[5], 'Sprint 21', 'To Do', memberIds[0], '2026-01-19'],
    [storyIds[5], 'Sprint 22', 'In Progress', memberIds[0], '2026-01-26'],
    [storyIds[5], 'Sprint 23', 'Done', memberIds[0], '2026-02-02'],

    // CHKOUT-202 through Sprint 24
    [storyIds[6], 'Sprint 24', 'Done', memberIds[3], '2026-02-16'],

    // MOB-101: carried over Sprint 23 to Sprint 24
    [storyIds[12], 'Sprint 23', 'In Progress', memberIds[5], '2026-02-02'],
    [storyIds[12], 'Sprint 24', 'Done', memberIds[5], '2026-02-16'],

    // MOB-102: carried over Sprint 24 to Sprint 25
    [storyIds[13], 'Sprint 24', 'In Progress', memberIds[5], '2026-02-16'],
    [storyIds[13], currentSprint, 'In Review', memberIds[5], '2026-03-02'],

    // MOB-301
    [storyIds[18], 'Sprint 23', 'Done', memberIds[5], '2026-02-02'],

    // MOB-302
    [storyIds[19], 'Sprint 24', 'Done', memberIds[3], '2026-02-16'],

    // Current sprint stories
    [storyIds[1], currentSprint, 'In Progress', memberIds[0], '2026-03-02'],
    [storyIds[2], currentSprint, 'To Do', memberIds[0], '2026-03-02'],
    [storyIds[3], currentSprint, 'To Do', memberIds[4], '2026-03-02'],
    [storyIds[7], currentSprint, 'In Progress', memberIds[3], '2026-03-02'],
    [storyIds[8], currentSprint, 'To Do', memberIds[6], '2026-03-02'],
    [storyIds[10], currentSprint, 'To Do', memberIds[0], '2026-03-02'],
    [storyIds[14], currentSprint, 'In Progress', memberIds[5], '2026-03-02'],
    [storyIds[15], currentSprint, 'To Do', memberIds[6], '2026-03-02'],
    [storyIds[20], currentSprint, 'In Progress', memberIds[3], '2026-03-02'],
    [storyIds[21], currentSprint, 'To Do', memberIds[5], '2026-03-02'],
  ];

  sprintHistory.forEach(h => insertHistory.run(...h));
  console.log(`Inserted ${sprintHistory.length} sprint history entries.`);

  // --- Notes ---
  const insertNote = db.prepare(`
    INSERT INTO notes (content, category, project_id, feature_id, team_member_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const notes = [
    ['Sprint 24 retro: team velocity improved by 15% after switching to smaller story slicing. Keep this approach going forward.', 'retro', projectIds[0], null, null, '2026-03-01'],
    ['Marcus raised concerns about Stripe webhook reliability in staging. Need to add idempotency keys and retry queue before going to prod.', 'blocker', projectIds[0], featureIds[0], memberIds[1], '2026-02-28'],
    ['Priya identified 3 critical edge cases in the cart price calculation that were not covered in the acceptance criteria. Updated test plan.', 'update', projectIds[0], featureIds[1], memberIds[2], '2026-02-20'],
    ['Sarah is interested in leading the Order Tracking feature. She has experience with real-time event systems from her previous role.', 'one_on_one', null, null, memberIds[0], '2026-02-25'],
    ['Mobile app crash rate spiked to 2.1% after Sprint 23 release. Root cause: memory leak in image caching. James has a fix in progress.', 'update', projectIds[1], featureIds[5], memberIds[5], '2026-02-18'],
    ['Elena proposed using the same JWT library across auth service and existing API to reduce token validation overhead during migration.', 'general', projectIds[2], featureIds[6], memberIds[4], '2026-03-05'],
    ['Performance review cycle starts April 1. Need to collect peer feedback for Sarah, Marcus, and David by March 25.', 'performance', null, null, null, '2026-03-10'],
    ['Ryan set up new staging environment for API gateway. Base URL: staging-gw.internal.company.com. Load testing starts next sprint.', 'update', projectIds[2], null, memberIds[7], '2026-03-08'],
  ];

  notes.forEach(n => insertNote.run(...n));
  console.log(`Inserted ${notes.length} notes.`);

  // --- Todos ---
  const insertTodo = db.prepare(`
    INSERT INTO todos (title, description, due_date, priority, is_complete, project_id, team_member_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const todos = [
    ['Review Stripe integration PR', 'Marcus has the payment intent flow ready for review. Check error handling and idempotency.', '2026-03-10', 'high', 0, projectIds[0], memberIds[1]],
    ['Schedule Q2 planning meeting', 'Book room and send calendar invite to all leads for quarterly roadmap review.', '2026-03-14', 'medium', 0, null, null],
    ['Update mobile app release notes', 'Draft release notes for v2.1 beta including push notification features.', '2026-03-08', 'medium', 1, projectIds[1], memberIds[5]],
    ['Collect peer feedback for perf reviews', 'Send feedback forms for Sarah, Marcus, and David. Due before April review cycle.', '2026-03-25', 'high', 0, null, null],
    ['Set up API gateway monitoring dashboards', 'Create Grafana dashboards for latency, error rates, and rate limiting metrics.', '2026-03-20', 'medium', 0, projectIds[2], memberIds[7]],
    ['Fix flaky cart E2E tests', 'Cart total calculation test fails intermittently. Likely a race condition in the price update.', '2026-03-05', 'high', 0, projectIds[0], memberIds[2]],
    ['Order new staging server hardware', 'Current staging is underpowered for load testing the API gateway migration.', '2026-03-18', 'low', 0, projectIds[2], memberIds[7]],
  ];

  todos.forEach(t => insertTodo.run(...t));
  console.log(`Inserted ${todos.length} todos.`);

  // --- Blockers ---
  const insertBlocker = db.prepare(`
    INSERT INTO blockers (title, description, severity, status, project_id, feature_id, team_member_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const blockers = [
    ['Stripe sandbox rate limiting in CI', 'Our CI pipeline is hitting Stripe sandbox rate limits during integration tests, causing intermittent failures. Need to implement request mocking or get higher limits from Stripe.', 'critical', 'active', projectIds[0], featureIds[0], memberIds[1], '2026-03-05'],
    ['iOS 18.4 push notification permission changes', 'Apple changed the provisional notification flow in iOS 18.4 beta. Need to update our permission request logic before App Store submission.', 'medium', 'active', projectIds[1], featureIds[3], memberIds[5], '2026-02-28'],
    ['Legacy API authentication tokens incompatible with new gateway', 'Existing API tokens use a custom HMAC scheme that the new gateway doesn\'t support. Need migration path for 2000+ active tokens.', 'high', 'active', projectIds[2], featureIds[6], memberIds[4], '2026-03-08'],
    ['Cart price rounding discrepancy', 'Tax calculation produces different rounding results between frontend JS and backend Python. Off by $0.01 on ~5% of orders.', 'medium', 'resolved', projectIds[0], featureIds[1], memberIds[3], '2026-02-15'],
  ];

  blockers.forEach(b => insertBlocker.run(...b));
  console.log(`Inserted ${blockers.length} blockers.`);

  // --- One on Ones ---
  const insertOneOnOne = db.prepare(`
    INSERT INTO one_on_ones (team_member_id, date, talking_points, action_items, sentiment)
    VALUES (?, ?, ?, ?, ?)
  `);

  const oneOnOnes = [
    // Sarah Chen
    [memberIds[0], '2026-03-10', 'Discussed interest in leading Order Tracking feature. Reviewed recent Cart UI work - high quality. Talked about career growth toward tech lead.', 'Submit tech lead development plan by March 20. Shadow Elena on architecture review for API gateway.', 'engaged'],
    [memberIds[0], '2026-02-24', 'Sprint 24 went well. Completed cart layout ahead of schedule. Feeling good about the team dynamic.', 'No blockers. Continue with current trajectory.', 'engaged'],
    [memberIds[0], '2026-02-10', 'Onboarding to checkout project. Getting up to speed with the existing codebase. Some frustration with lack of documentation.', 'Create onboarding doc for checkout codebase. Pair with David on first story.', 'neutral'],

    // Marcus Johnson
    [memberIds[1], '2026-03-07', 'Stripe integration is complex but progressing. Frustrated with CI rate limiting blocker - has been stuck for 3 days. Wants to explore event-driven architecture.', 'Escalate Stripe rate limit issue. Look into API mocking library for CI. Share event-driven arch resources.', 'frustrated'],
    [memberIds[1], '2026-02-21', 'Completed payment intent flow. Good sprint. Interested in mentoring junior devs next quarter.', 'Sign up for mentoring program. Document Stripe integration patterns.', 'engaged'],

    // Priya Patel
    [memberIds[2], '2026-03-06', 'Identified critical edge cases in cart pricing. Feeling stretched thin across both checkout and mobile testing. Would like more automated test infrastructure.', 'Prioritize checkout QA for next 2 sprints. Draft proposal for test automation framework investment.', 'needs_support'],
    [memberIds[2], '2026-02-20', 'Good progress on test coverage for cart UI. Enjoying the cross-team collaboration.', 'Continue building test suite. Share testing best practices in team wiki.', 'engaged'],

    // David Kim
    [memberIds[3], '2026-03-05', 'Working on wishlist feature. Finding frontend patterns well-structured after Sarah set up the cart. Interested in learning more about mobile development.', 'Complete wishlist by end of sprint. Set up lunch-and-learn with James on React Native.', 'engaged'],
    [memberIds[3], '2026-02-19', 'Finished price calculation feature. Felt productive. Asking about opportunities to contribute to the API gateway project.', 'Talk to Elena about potential contribution areas in API gateway.', 'engaged'],

    // Elena Rodriguez
    [memberIds[4], '2026-03-04', 'API gateway architecture design is going well. Concerned about token migration complexity - 2000+ active tokens is a lot. Wants to propose a phased migration.', 'Write phased migration RFC by March 15. Schedule architecture review with team.', 'neutral'],
    [memberIds[4], '2026-02-18', 'Finishing up current backend tasks. Excited about leading the auth service design for API gateway.', 'Start auth service architecture doc. Review industry best practices for API gateway auth.', 'engaged'],

    // James O'Brien
    [memberIds[5], '2026-03-03', 'Push notification work is behind due to iOS 18.4 changes. Worried about the timeline. Also dealing with the crash rate fix from Sprint 23.', 'Reprioritize: crash fix first, then notification permissions. Update sprint scope with PM.', 'frustrated'],
    [memberIds[5], '2026-02-17', 'Cold start profiling found good optimization opportunities. Feeling motivated by performance wins.', 'Document performance improvements. Share findings in engineering all-hands.', 'engaged'],

    // Aisha Thompson
    [memberIds[6], '2026-03-09', 'Cart empty state designs are ready. Notification preference center wireframes in progress. Feeling good about design system adoption across both projects.', 'Finalize preference center designs by March 13. Schedule design review with product.', 'engaged'],
    [memberIds[6], '2026-02-23', 'Completed initial cart UI mockups. Good collaboration with Sarah on implementation. Design system components are scaling well.', 'Update design system docs. Start on order tracking page concepts.', 'engaged'],

    // Ryan Nakamura
    [memberIds[7], '2026-03-08', 'Staging environment is up for API gateway. Worried about timeline for monitoring dashboards - too many tools to configure. Need to prioritize.', 'Focus on Grafana dashboards first. Defer alerting rules to next sprint. Request additional DevOps support if needed.', 'neutral'],
    [memberIds[7], '2026-02-22', 'Infrastructure work for checkout is stable. Starting to plan API gateway environments. Wants to evaluate new observability tooling.', 'Evaluate Datadog vs Grafana stack for API gateway. Present recommendation by March 5.', 'engaged'],
  ];

  oneOnOnes.forEach(o => insertOneOnOne.run(...o));
  console.log(`Inserted ${oneOnOnes.length} one-on-one entries.`);

  // --- GitHub PR sample data -------------------------------------------------

  db.prepare('DELETE FROM pr_reviews').run();
  db.prepare('DELETE FROM pull_requests').run();
  db.prepare('DELETE FROM github_repos').run();

  // Always refresh last_sync_at so the "synced N minutes ago" indicator has a
  // real value, but never clobber a base_url/pat_token/sync_days_back a
  // developer has already configured on their own machine.
  db.prepare(
    `INSERT INTO github_settings (id, base_url, pat_token, sync_days_back, last_sync_at)
     VALUES ('default', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(id) DO UPDATE SET last_sync_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`
  ).run('https://api.github.com', 'ghp_seedtoken0000', 180);

  const firstProject = db.prepare('SELECT id FROM projects ORDER BY id LIMIT 1').get();
  const ghMembers = db.prepare('SELECT id, name FROM team_members ORDER BY id LIMIT 3').all();

  // Give the first two members a GitHub login; leave the third unmapped so the
  // UI's "raw login" path is exercised.
  if (ghMembers[0]) db.prepare('UPDATE team_members SET github_login = ? WHERE id = ?').run('ahmed', ghMembers[0].id);
  if (ghMembers[1]) db.prepare('UPDATE team_members SET github_login = ? WHERE id = ?').run('sara', ghMembers[1].id);

  const repoRows = [
    ['acme', 'api', 'API', firstProject ? firstProject.id : null, null],
    ['acme', 'web', 'Web', firstProject ? firstProject.id : null, null],
    ['acme', 'legacy-billing', 'Legacy billing', null, '404 Not Found'],
  ];
  repoRows.forEach(([owner, name, label, projectId, err]) => {
    db.prepare(
      "INSERT INTO github_repos (owner, name, label, project_id, is_active, last_sync_at, last_sync_error) VALUES (?,?,?,?,1,strftime('%Y-%m-%dT%H:%M:%SZ','now'),?)"
    ).run(owner, name, label, projectId, err);
  });

  const apiRepo = db.prepare("SELECT id FROM github_repos WHERE name = 'api'").get();
  const webRepo = db.prepare("SELECT id FROM github_repos WHERE name = 'web'").get();
  const ghStory = db.prepare('SELECT id, sprint FROM stories WHERE sprint IS NOT NULL ORDER BY id LIMIT 1').get();
  const ghSprintName = ghStory ? ghStory.sprint : 'Sprint 1';

  function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString();
  }

  const prs = [
    // linked to a real story, merged, by a mapped member
    { repo: apiRepo.id, number: 412, title: 'PAY-118 add refund webhook',
      state: 'merged', isDraft: 0, author: 'ahmed', member: ghMembers[0] ? ghMembers[0].id : null,
      storyId: ghStory ? ghStory.id : null, jira: 'PAY-118', sprint: ghSprintName, source: 'story',
      created: daysAgo(9), merged: daysAgo(7), closed: null, review: daysAgo(8), add: 210, del: 40 },
    // open and stale: no review, older than 3 days
    { repo: webRepo.id, number: 409, title: 'PAY-120 checkout error states',
      state: 'open', isDraft: 0, author: 'sara', member: ghMembers[1] ? ghMembers[1].id : null,
      storyId: null, jira: 'PAY-120', sprint: ghSprintName, source: 'story',
      created: daysAgo(11), merged: null, closed: null, review: null, add: 88, del: 12 },
    // no Jira key, attributed by date window
    { repo: apiRepo.id, number: 404, title: 'bump deps',
      state: 'merged', isDraft: 0, author: 'omar', member: null,
      storyId: null, jira: null, sprint: ghSprintName, source: 'date_window',
      created: daysAgo(5), merged: daysAgo(5), closed: null, review: daysAgo(5), add: 6, del: 6 },
    // open but fresh, so not stale
    { repo: webRepo.id, number: 415, title: 'OPS-77 sprint burndown fix',
      state: 'open', isDraft: 0, author: 'ahmed', member: ghMembers[0] ? ghMembers[0].id : null,
      storyId: null, jira: 'OPS-77', sprint: ghSprintName, source: 'story',
      created: daysAgo(1), merged: null, closed: null, review: null, add: 45, del: 30 },
    // closed (not merged) — exercises the "closed" render path
    { repo: webRepo.id, number: 418, title: 'CHKOUT-210 remove legacy cart flag',
      state: 'closed', isDraft: 0, author: 'omar', member: null,
      storyId: null, jira: 'CHKOUT-210', sprint: ghSprintName, source: 'story',
      created: daysAgo(6), merged: null, closed: daysAgo(4), review: null, add: 15, del: 60 },
    // draft, open, no review, older than 3 days — must NOT be flagged stale
    { repo: apiRepo.id, number: 420, title: 'MOB-150 experimental sync draft',
      state: 'open', isDraft: 1, author: 'sara', member: ghMembers[1] ? ghMembers[1].id : null,
      storyId: null, jira: 'MOB-150', sprint: ghSprintName, source: 'story',
      created: daysAgo(5), merged: null, closed: null, review: null, add: 5, del: 2 },
    // merged PR carrying multiple review states, one from an unmapped login
    { repo: webRepo.id, number: 422, title: 'CHKOUT-215 tax display fix',
      state: 'merged', isDraft: 0, author: 'ahmed', member: ghMembers[0] ? ghMembers[0].id : null,
      storyId: null, jira: 'CHKOUT-215', sprint: ghSprintName, source: 'story',
      created: daysAgo(6), merged: daysAgo(4), closed: null, review: daysAgo(5.5), add: 32, del: 8 },
  ];

  prs.forEach((pr) => {
    db.prepare(
      `INSERT INTO pull_requests (
         repo_id, number, title, url, state, is_draft, author_login, author_member_id,
         base_branch, head_branch, additions, deletions, changed_files,
         pr_created_at, first_review_at, merged_at, closed_at,
         jira_key, story_id, sprint, sprint_source
       ) VALUES (?,?,?,?,?,?,?,?,'main','feature/x',?,?,3,?,?,?,?,?,?,?,?)`
    ).run(
      pr.repo, pr.number, pr.title,
      `https://github.com/acme/repo/pull/${pr.number}`,
      pr.state, pr.isDraft, pr.author, pr.member, pr.add, pr.del,
      pr.created, pr.review, pr.merged, pr.closed, pr.jira, pr.storyId, pr.sprint, pr.source
    );

    if (pr.review) {
      const saved = db
        .prepare('SELECT id FROM pull_requests WHERE repo_id = ? AND number = ?')
        .get(pr.repo, pr.number);

      if (pr.number === 422) {
        // Multiple review states (approved / changes_requested / commented),
        // including one from a GitHub login with no matching team member —
        // exercises the unmapped-reviewer path.
        const insertReview = db.prepare(
          'INSERT INTO pr_reviews (pull_request_id, reviewer_login, reviewer_member_id, state, submitted_at) VALUES (?,?,?,?,?)'
        );
        insertReview.run(saved.id, 'sara', ghMembers[1] ? ghMembers[1].id : null, 'commented', daysAgo(5.5));
        insertReview.run(saved.id, 'devon', null, 'changes_requested', daysAgo(5));
        insertReview.run(saved.id, 'ahmed', ghMembers[0] ? ghMembers[0].id : null, 'approved', daysAgo(4.5));
      } else {
        const reviewer = pr.author === 'ahmed' ? 'sara' : 'ahmed';
        const reviewerMember = reviewer === 'ahmed'
          ? (ghMembers[0] ? ghMembers[0].id : null)
          : (ghMembers[1] ? ghMembers[1].id : null);
        db.prepare(
          'INSERT INTO pr_reviews (pull_request_id, reviewer_login, reviewer_member_id, state, submitted_at) VALUES (?,?,?,?,?)'
        ).run(saved.id, reviewer, reviewerMember, 'approved', pr.review);
      }
    }
  });

  console.log(`Seeded 3 github repos and ${prs.length} pull requests`);

  db.close();
  console.log('\nSeed complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
