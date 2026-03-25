import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../lib/api';
import { isDoneStatus } from '../lib/statuses';

const STANDUP_STATUSES = ['In Progress', 'Blocked', 'In Review', 'Done'];

export default function StandupModal({ memberId, memberName, stories, onClose, onSaved }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Filter to non-Done stories assigned to this member in current sprint
  const memberStories = stories.filter(s => {
    if (isDoneStatus(s.status)) return false;
    if (s.assignee_id != null) return Number(s.assignee_id) === Number(memberId);
    return s.assignee === memberName;
  });

  // Load existing entries for this member+date
  useEffect(() => {
    async function load() {
      try {
        const existing = await api.get(`/standups/member/${memberId}?date=${date}`);
        const existingMap = {};
        for (const e of existing) {
          existingMap[e.story_id] = { status: e.status, note: e.note || '' };
        }

        setEntries(
          memberStories.map(s => ({
            story_id: s.id,
            key: s.key,
            summary: s.summary,
            status: existingMap[s.id]?.status || mapStoryStatus(s.status),
            note: existingMap[s.id]?.note || '',
          }))
        );
      } catch {
        // Fallback: initialize from story statuses
        setEntries(
          memberStories.map(s => ({
            story_id: s.id,
            key: s.key,
            summary: s.summary,
            status: mapStoryStatus(s.status),
            note: '',
          }))
        );
      }
    }
    load();
  }, [memberId, date]);

  function mapStoryStatus(storyStatus) {
    if (!storyStatus) return 'In Progress';
    if (isDoneStatus(storyStatus)) return 'Done';
    const lower = storyStatus.toLowerCase();
    if (lower === 'in progress' || lower === 'in_progress') return 'In Progress';
    if (lower === 'blocked') return 'Blocked';
    if (lower === 'in review' || lower === 'code review') return 'In Review';
    return 'In Progress';
  }

  function updateEntry(idx, field, value) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  async function handleSave() {
    setSubmitting(true);
    try {
      await api.post('/standups/batch', {
        team_member_id: memberId,
        standup_date: date,
        entries: entries.map(e => ({
          story_id: e.story_id,
          status: e.status,
          note: e.note.trim() || null,
        })),
      });
      onSaved();
    } catch (err) {
      console.error('Failed to save standup:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Log Standup — {memberName}</h2>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {memberStories.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No active stories assigned to {memberName} in this sprint.
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, idx) => (
                <div key={entry.story_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-mono text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">
                      {entry.key}
                    </span>
                    <span className="text-sm text-gray-900 truncate" title={entry.summary}>
                      {entry.summary && entry.summary.length > 50
                        ? entry.summary.slice(0, 50) + '...'
                        : entry.summary}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={entry.status}
                      onChange={e => updateEntry(idx, 'status', e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {STANDUP_STATUSES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={entry.note}
                      onChange={e => updateEntry(idx, 'note', e.target.value)}
                      placeholder="Optional note..."
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting || memberStories.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
