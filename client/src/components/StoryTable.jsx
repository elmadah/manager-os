import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, Pencil, ExternalLink, Trash2, BookOpen, Bug, User } from 'lucide-react';

// Shared status priority for sorting
const STATUS_PRIORITY = {
  'in progress': 0, 'in_progress': 0,
  'in review': 1, 'code review': 1,
  'to do': 2, 'todo': 2, 'open': 2,
  'done': 3, 'closed': 3,
};

function getStatusPriority(status) {
  if (!status) return 99;
  return STATUS_PRIORITY[status.toLowerCase()] ?? 50;
}

function isDone(status) {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower === 'done' || lower === 'closed' || lower === 'resolved';
}

// Status badge pill style
function getStatusClasses(status) {
  if (!status) return 'bg-gray-100 text-gray-700';
  const lower = status.toLowerCase();
  if (lower === 'in progress' || lower === 'in_progress') return 'bg-blue-100 text-blue-700';
  if (lower === 'in review' || lower === 'code review') return 'bg-purple-100 text-purple-700';
  if (isDone(lower)) return 'bg-green-100 text-green-700';
  return 'bg-gray-100 text-gray-700';
}

export function IssueTypeIcon({ issueType }) {
  const type = (issueType || '').toLowerCase();
  if (type === 'bug' || type === 'defect') {
    return <Bug size={14} className="text-red-500 shrink-0" title="Bug" />;
  }
  return <BookOpen size={14} className="text-green-600 shrink-0" title="Story" />;
}

const DEFAULT_SORT = { key: null, direction: 'asc' };

export default function StoryTable({
  stories,
  columns,
  defaultSort = DEFAULT_SORT,
  sortable = true,
  onEdit,
  onDelete,
  jiraBaseUrl,
  renderCell,
  rowClassName,
  className = '',
  compact = false,
  memberColorMap = {},
}) {
  const [sortConfig, setSortConfig] = useState(defaultSort);

  const px = compact ? 'px-3' : 'px-5';
  const py = compact ? 'py-2' : 'py-2.5';

  const sortedStories = useMemo(() => {
    if (!sortConfig.key) return stories;
    return [...stories].sort((a, b) => {
      const { key, direction } = sortConfig;
      const mult = direction === 'asc' ? 1 : -1;

      if (key === 'status') {
        return mult * (getStatusPriority(a.status) - getStatusPriority(b.status));
      }
      if (key === 'story_points' || key === 'carry_over_count') {
        return mult * ((a[key] || 0) - (b[key] || 0));
      }
      const aVal = (a[key] || '').toString().toLowerCase();
      const bVal = (b[key] || '').toString().toLowerCase();
      return mult * aVal.localeCompare(bVal);
    });
  }, [stories, sortConfig]);

  function handleSort(key) {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  const hasActions = onEdit || onDelete || jiraBaseUrl;

  const effectiveColumns = columns.map(col => {
    if (col.key === 'actions' && !hasActions) return null;
    return col;
  }).filter(Boolean);

  function renderCellContent(col, story) {
    if (renderCell && renderCell[col.key]) {
      return renderCell[col.key](story);
    }

    switch (col.key) {
      case 'key':
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-600 font-medium">
            <IssueTypeIcon issueType={story.issue_type} />
            {story.key}
          </span>
        );
      case 'summary':
        return (
          <span className="text-gray-900 truncate block" title={story.summary}>
            {story.summary && story.summary.length > 60
              ? story.summary.slice(0, 60) + '…'
              : story.summary}
          </span>
        );
      case 'status':
        if (!story.status) return <span className="text-gray-400">—</span>;
        return (
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getStatusClasses(story.status)}`}>
            {story.status}
          </span>
        );
      case 'assignee': {
        const assigneeName = story.assignee || story.assignee_name;
        if (!assigneeName) return <span className="text-gray-400">—</span>;
        const assigneeColor = memberColorMap[assigneeName];
        return (
          <span className="inline-flex items-center gap-1.5 text-gray-600 text-xs">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: assigneeColor || '#9ca3af' }}
            >
              <User size={10} className="text-white" />
            </span>
            {assigneeName}
          </span>
        );
      }
      case 'story_points':
        return <span className="font-medium text-gray-900">{story.story_points || '—'}</span>;
      case 'release_date':
        return (
          <span className="text-gray-600 text-xs">
            {story.release_date
              ? new Date(story.release_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '—'}
          </span>
        );
      case 'carry_over_count': {
        const count = story.carry_over_count || 0;
        return (
          <span className={`font-medium ${
            count >= 3 ? 'text-red-600 font-bold' : count > 0 ? 'text-orange-600' : 'text-gray-400'
          }`}>
            {count}
          </span>
        );
      }
      case 'sprint':
        return <span className="text-gray-600 text-xs">{story.sprint || '—'}</span>;
      case 'feature_name':
        return <span className="text-gray-600 text-xs">{story.feature_name || '—'}</span>;
      case 'project_name':
        return <span className="text-gray-600 text-xs">{story.project_name || '—'}</span>;
      case 'actions':
        return (
          <div className="inline-flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(story)}
                className="text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit story"
              >
                <Pencil size={14} />
              </button>
            )}
            {jiraBaseUrl && story.key ? (
              <a
                href={`${jiraBaseUrl}/browse/${story.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                title="Open in Jira"
              >
                <ExternalLink size={14} />
              </a>
            ) : null}
            {onDelete && (
              <button
                onClick={() => onDelete(story)}
                className="text-gray-400 hover:text-red-600 transition-colors"
                title="Delete story"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      default:
        return <span className="text-gray-600 text-xs">{story[col.key] ?? '—'}</span>;
    }
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {effectiveColumns.map(col => {
              const isSortable = sortable && col.sortable !== false && col.key !== 'actions';
              return (
                <th
                  key={col.key}
                  className={`${px} ${py} text-xs font-medium text-gray-500 uppercase tracking-wide ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${isSortable ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}
                  onClick={isSortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSortable && sortConfig.key === col.key && (
                      sortConfig.direction === 'asc'
                        ? <ArrowUp size={12} />
                        : <ArrowDown size={12} />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedStories.map(story => (
            <tr
              key={story.id}
              className={rowClassName ? rowClassName(story) : 'border-b border-gray-50 hover:bg-gray-50'}
            >
              {effectiveColumns.map(col => (
                <td
                  key={col.key}
                  className={`${px} ${py} ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.key === 'summary' ? 'max-w-xs' : ''}`}
                >
                  {renderCellContent(col, story)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { getStatusPriority, isDone, getStatusClasses };
