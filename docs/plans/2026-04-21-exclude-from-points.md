# Exclude Member from Points — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow capacity plan members (TPMs, PMs) to be included in hours but excluded from Jira points.

**Architecture:** Add `exclude_from_points` column to `capacity_plan_members`, zero out points in server-side calculation, toggle via existing PATCH endpoint, show toggle in kebab menu and "—" in Pts column.

**Tech Stack:** SQLite, Express, React

---

### Task 1: Add DB column and migration

**Files:**
- Modify: `server/db/schema.sql:185-189`
- Modify: `server/db/init.js:68+`

**Step 1: Add column to schema**

In `server/db/schema.sql`, add `exclude_from_points` to the `capacity_plan_members` table:

```sql
CREATE TABLE IF NOT EXISTS capacity_plan_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES capacity_plans(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  is_excluded INTEGER DEFAULT 0,
  exclude_from_points INTEGER DEFAULT 0,
  UNIQUE(plan_id, member_id)
);
```

**Step 2: Add migration for existing databases**

In `server/db/init.js`, after the existing `migrate()` calls (around line 79), add:

```js
migrate('capacity_plan_members', 'exclude_from_points', 'INTEGER DEFAULT 0');
```

**Step 3: Verify server starts**

Run: `cd server && node -e "const db = require('./db/init'); db.init().then(() => console.log('OK'))"`
Expected: `OK`

**Step 4: Commit**

```bash
git add server/db/schema.sql server/db/init.js
git commit -m "feat: add exclude_from_points column to capacity_plan_members"
```

---

### Task 2: Update server calculation and PATCH endpoint

**Files:**
- Modify: `server/routes/capacity.js:147-170` (member totals calculation)
- Modify: `server/routes/capacity.js:294-315` (PATCH endpoint)

**Step 1: Pass flag through member query**

The members query at line 119 already does `SELECT cpm.*`, so `exclude_from_points` is already included. No change needed there.

**Step 2: Zero out points for excluded members**

In `server/routes/capacity.js`, in the `memberTotals` map (line 166), change the points calculation:

```js
// Before:
points: Math.round((actualHours / hoursPerPoint) * 10) / 10,

// After:
points: m.exclude_from_points ? 0 : Math.round((actualHours / hoursPerPoint) * 10) / 10,
```

Also add the flag to the returned object (after `color: m.color,`):

```js
exclude_from_points: !!m.exclude_from_points,
```

**Step 3: Update PATCH endpoint to accept `exclude_from_points`**

In `server/routes/capacity.js`, update the PATCH handler (line 294-315) to handle both flags:

```js
// PATCH /api/capacity-plans/:id/members/:memberId — update member flags
router.patch('/:id/members/:memberId', (req, res) => {
  try {
    const planId = Number(req.params.id);
    const memberId = Number(req.params.memberId);

    const existing = db.prepare(
      'SELECT id FROM capacity_plan_members WHERE plan_id = ? AND member_id = ?'
    ).get(planId, memberId);
    if (!existing) return res.status(404).json({ error: 'Member not on this plan' });

    if (req.body.is_excluded !== undefined) {
      db.prepare(
        'UPDATE capacity_plan_members SET is_excluded = ? WHERE plan_id = ? AND member_id = ?'
      ).run(req.body.is_excluded ? 1 : 0, planId, memberId);
    }

    if (req.body.exclude_from_points !== undefined) {
      db.prepare(
        'UPDATE capacity_plan_members SET exclude_from_points = ? WHERE plan_id = ? AND member_id = ?'
      ).run(req.body.exclude_from_points ? 1 : 0, planId, memberId);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 4: Commit**

```bash
git add server/routes/capacity.js
git commit -m "feat: exclude_from_points in capacity calculation and PATCH endpoint"
```

---

### Task 3: Update kebab menu in CapacityGrid

**Files:**
- Modify: `client/src/components/CapacityGrid.jsx:79-87` (add toggle function)
- Modify: `client/src/components/CapacityGrid.jsx:173-189` (add menu item)

**Step 1: Add toggle function**

After the `excludeMember` function (line 87), add:

```jsx
async function toggleExcludeFromPoints(memberId) {
  const member = plan.members.find((m) => m.member_id === memberId);
  const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/capacity-plans/${plan.id}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exclude_from_points: !member.exclude_from_points }),
  });
  if (res.ok) onChange();
  setMenuOpen(null);
}
```

**Step 2: Add menu item to kebab portal**

In the kebab menu portal (line 182-188), add a second button before "Exclude from plan":

```jsx
<button
  onClick={() => toggleExcludeFromPoints(menuOpen.memberId)}
  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
>
  {plan.members.find((m) => m.member_id === menuOpen.memberId)?.exclude_from_points
    ? 'Include in points'
    : 'Exclude from points'}
</button>
```

**Step 3: Show "—" in Pts column for excluded members**

In the member row (line 164), change the Pts cell:

```jsx
// Before:
<td className="px-3 py-2 text-right tabular-nums text-gray-700">{totals.points ?? 0}</td>

// After:
<td className="px-3 py-2 text-right tabular-nums text-gray-700">
  {totals.exclude_from_points ? '—' : (totals.points ?? 0)}
</td>
```

**Step 4: Commit**

```bash
git add client/src/components/CapacityGrid.jsx
git commit -m "feat: add exclude from points toggle to capacity grid kebab menu"
```
