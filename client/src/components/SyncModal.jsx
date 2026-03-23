import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  Check,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from './ToastProvider';

export default function SyncModal({ board, onClose }) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [assignments, setAssignments] = useState({}); // { storyKey: { project_id, feature_id } }
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetchPreview();
  }, [board.id]);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/settings/jira/boards/${board.id}/sync`);
      setPreview(data);
    } catch (err) {
      setError(err.data?.error || err.message || 'Failed to fetch sprint data');
    } finally {
      setLoading(false);
    }
  }

  function handleAssignment(storyKey, field, value) {
    setAssignments((prev) => {
      const current = prev[storyKey] || {};
      const updated = { ...current, [field]: value ? parseInt(value, 10) : null };
      // Clear feature_id when project changes
      if (field === 'project_id') {
        updated.feature_id = null;
      }
      return { ...prev, [storyKey]: updated };
    });
  }

  function getFeaturesForProject(projectId) {
    if (!projectId || !preview?.features) return [];
    return preview.features.filter((f) => f.project_id === projectId);
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      // Build assignments array
      const assignmentList = preview.new_stories.map((story) => ({
        key: story.key,
        project_id: assignments[story.key]?.project_id || null,
        feature_id: assignments[story.key]?.feature_id || null,
      }));

      const data = await api.post(`/settings/jira/boards/${board.id}/sync`, {
        preview_id: preview.preview_id,
        assignments: assignmentList,
      });
      setResult(data);
      toast.success(
        `Synced: ${data.updated_count} updated, ${data.new_count} new stories`
      );
    } catch (err) {
      setError(err.data?.error || err.message || 'Sync failed');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Sync: {board.label}
            </h2>
            {preview && (
              <p className="text-sm text-gray-500">
                Sprint: {preview.sprint_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
              <p className="text-sm text-gray-500">
                Fetching active sprint from Jira...
              </p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="py-8">
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
              <div className="flex justify-center mt-4">
                <button
                  onClick={fetchPreview}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Sync Complete
              </h3>
              <p className="text-sm text-gray-600 mb-1">
                Sprint: {result.sprint_name}
              </p>
              <div className="flex gap-4 text-sm text-gray-600">
                <span>{result.updated_count} updated</span>
                <span>{result.new_count} new</span>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && !result && !loading && !error && (
            <div className="space-y-6">
              {/* Updated stories summary */}
              {(preview.updated_count > 0 || preview.unchanged_count > 0) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-blue-800">
                    <strong>{preview.updated_count}</strong> existing{' '}
                    {preview.updated_count === 1 ? 'story' : 'stories'} will be
                    updated
                    {preview.unchanged_count > 0 && (
                      <span className="text-blue-600">
                        {' '}
                        ({preview.unchanged_count} unchanged)
                      </span>
                    )}
                  </p>
                  {preview.updated.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {preview.updated.map((story) => (
                        <div
                          key={story.key}
                          className="text-xs text-blue-700 flex items-center gap-2"
                        >
                          <span className="font-mono font-medium">
                            {story.key}
                          </span>
                          <span className="truncate">{story.summary}</span>
                          {Object.entries(story.changes).map(
                            ([field, change]) => (
                              <span
                                key={field}
                                className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 rounded text-xs"
                              >
                                {field}:{' '}
                                <span className="line-through">
                                  {String(change.from || '—')}
                                </span>
                                <ArrowRight className="w-3 h-3" />
                                {String(change.to || '—')}
                              </span>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* New stories */}
              {preview.new_stories.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    New Stories ({preview.new_stories.length})
                  </h3>
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">
                            Key
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">
                            Summary
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">
                            Type
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">
                            Epic
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5 min-w-[150px]">
                            Project
                          </th>
                          <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5 min-w-[150px]">
                            Feature
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.new_stories.map((story) => {
                          const assignment = assignments[story.key] || {};
                          const availableFeatures = getFeaturesForProject(
                            assignment.project_id
                          );

                          return (
                            <tr
                              key={story.key}
                              className="border-b border-gray-100 bg-green-50/50"
                            >
                              <td className="px-4 py-2.5 text-sm font-mono text-gray-700">
                                {story.key}
                              </td>
                              <td
                                className="px-4 py-2.5 text-sm text-gray-900 max-w-[200px] truncate"
                                title={story.summary}
                              >
                                {story.summary}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                    story.issue_type?.toLowerCase() === 'bug' ||
                                    story.issue_type?.toLowerCase() === 'defect'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-blue-100 text-blue-700'
                                  }`}
                                >
                                  {story.issue_type}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">
                                {story.epic_key || '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={assignment.project_id || ''}
                                  onChange={(e) =>
                                    handleAssignment(
                                      story.key,
                                      'project_id',
                                      e.target.value
                                    )
                                  }
                                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                                >
                                  <option value="">Select project</option>
                                  {preview.projects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-2.5">
                                <select
                                  value={assignment.feature_id || ''}
                                  onChange={(e) =>
                                    handleAssignment(
                                      story.key,
                                      'feature_id',
                                      e.target.value
                                    )
                                  }
                                  disabled={!assignment.project_id}
                                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                >
                                  <option value="">Select feature</option>
                                  {availableFeatures.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                preview.updated_count === 0 &&
                preview.unchanged_count === 0 && (
                  <div className="text-center py-8 text-sm text-gray-500">
                    No stories found in the active sprint.
                  </div>
                )
              )}

              {preview.new_stories.length === 0 &&
                preview.updated_count === 0 &&
                preview.unchanged_count > 0 && (
                  <div className="text-center py-4 text-sm text-gray-500">
                    All stories are up to date. No changes to apply.
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        {preview && !result && !loading && !error && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={
                confirming ||
                (preview.new_stories.length === 0 &&
                  preview.updated_count === 0)
              }
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirm Sync
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer for result/error states */}
        {(result || (error && !loading)) && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
