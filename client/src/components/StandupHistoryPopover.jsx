import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';

function StatusBadge({ status }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  let classes = 'bg-gray-100 text-gray-700';
  if (lower === 'in progress') classes = 'bg-blue-100 text-blue-700';
  else if (lower === 'blocked') classes = 'bg-red-100 text-red-700';
  else if (lower === 'in review') classes = 'bg-purple-100 text-purple-700';
  else if (lower === 'done') classes = 'bg-green-100 text-green-700';

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}

export default function StandupHistoryPopover({ storyId, storyKey, storySummary, daysSstale, anchorRect, onClose }) {
  const [entries, setEntries] = useState(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get(`/standups/story/${storyId}`);
        setEntries(data.slice(0, 7));
      } catch {
        setEntries([]);
      }
    }
    load();
  }, [storyId]);

  // Click outside to dismiss
  useEffect(() => {
    function handleClick(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Determine if a row is "unchanged" (same status as previous with no note)
  function isUnchanged(entry, idx) {
    if (entry.note && entry.note.trim()) return false;
    if (idx >= (entries?.length || 0) - 1) return false;
    return entries[idx + 1]?.status === entry.status;
  }

  // Position the popover below the anchor, centered horizontally
  const style = {};
  if (anchorRect) {
    style.position = 'fixed';
    style.top = anchorRect.bottom + 4;
    style.left = anchorRect.left + anchorRect.width / 2;
    style.transform = 'translateX(-50%)';
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="z-[100] bg-white border border-gray-200 rounded-xl shadow-lg w-80"
      style={style}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-blue-600 font-medium">{storyKey}</span>
        </div>
        <div className="text-sm text-gray-700 mt-1 truncate" title={storySummary}>
          {storySummary}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 max-h-64 overflow-y-auto">
        {entries === null ? (
          <div className="text-sm text-gray-400 text-center py-4">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-4">No standup history yet</div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className={`flex items-start gap-2 text-sm py-1.5 px-2 rounded ${
                  isUnchanged(entry, idx) ? 'bg-amber-50' : ''
                }`}
              >
                <span className="text-gray-500 text-xs whitespace-nowrap mt-0.5">
                  {entry.standup_date}
                </span>
                <StatusBadge status={entry.status} />
                {entry.note && (
                  <span className="text-gray-600 text-xs break-words">
                    {entry.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {daysSstale > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 text-xs font-medium text-amber-600">
          Same status for {daysSstale} days
        </div>
      )}
    </div>,
    document.body
  );
}
