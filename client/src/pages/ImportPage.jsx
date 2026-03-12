import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, AlertTriangle, Check, Loader2, Filter, DatabaseBackup, ChevronDown, ChevronRight, Info } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const DIFF_COLORS = {
  new: { bg: 'bg-green-50', badge: 'bg-green-100 text-green-700', label: 'New' },
  updated: { bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', label: 'Updated' },
  carry_over: { bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700', label: 'Carry Over' },
  closed: { bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700', label: 'Closed' },
  unchanged: { bg: 'bg-white', badge: 'bg-gray-100 text-gray-600', label: 'Unchanged' },
};

export default function ImportPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const restoreInputRef = useRef(null);

  // File state
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Upload/preview state
  const [uploading, setUploading] = useState(false);
  const [importId, setImportId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  // Filter state
  const [activeFilters, setActiveFilters] = useState(new Set(['new', 'updated', 'carry_over', 'closed', 'unchanged']));

  // Feature assignment state
  const [featureAssignments, setFeatureAssignments] = useState({});
  const [features, setFeatures] = useState([]);
  const [projects, setProjects] = useState([]);

  // Inline new feature state
  const [newFeatureFor, setNewFeatureFor] = useState(null); // story key
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeatureProjectId, setNewFeatureProjectId] = useState('');
  const [creatingFeature, setCreatingFeature] = useState(false);

  // Confirm state
  const [confirming, setConfirming] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Help section state
  const [showHelp, setShowHelp] = useState(false);

  // Restore state
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreData, setRestoreData] = useState(null);

  const handleFile = (f) => {
    setError(null);
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'json'].includes(ext)) {
      setError('Only .csv and .json files are accepted');
      return;
    }
    setFile(f);
    // Reset preview state
    setPreview(null);
    setSummary(null);
    setImportId(null);
    setImportResult(null);
    setFeatureAssignments({});
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadFeaturesAndProjects = async () => {
    try {
      const projectList = await api.get('/projects');
      setProjects(projectList);
      const allFeatures = [];
      for (const p of projectList) {
        const feats = await api.get(`/projects/${p.id}/features`);
        allFeatures.push(...feats.map(f => ({ ...f, project_name: p.name })));
      }
      setFeatures(allFeatures);
    } catch {
      // Features loading is non-critical
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/import`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setImportId(data.import_id);
      setPreview(data.preview);
      setSummary(data.summary);
      setActiveFilters(new Set(['new', 'updated', 'carry_over', 'closed', 'unchanged']));

      // Pre-populate feature assignments from existing stories
      const assignments = {};
      for (const row of data.preview) {
        if (row.feature_id) {
          assignments[row.key] = row.feature_id;
        }
      }
      setFeatureAssignments(assignments);

      await loadFeaturesAndProjects();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFeatureAssignment = (storyKey, featureId) => {
    if (featureId === '__new__') {
      setNewFeatureFor(storyKey);
      setNewFeatureName('');
      setNewFeatureProjectId(projects[0]?.id || '');
      return;
    }
    setFeatureAssignments(prev => {
      const next = { ...prev };
      if (featureId === '') {
        delete next[storyKey];
      } else {
        next[storyKey] = parseInt(featureId, 10);
      }
      return next;
    });
  };

  const handleCreateFeature = async (storyKey) => {
    if (!newFeatureName.trim() || !newFeatureProjectId) return;
    setCreatingFeature(true);
    try {
      const feat = await api.post(`/projects/${newFeatureProjectId}/features`, {
        name: newFeatureName.trim(),
      });
      const project = projects.find(p => p.id === parseInt(newFeatureProjectId, 10));
      setFeatures(prev => [...prev, { ...feat, project_name: project?.name || '' }]);
      setFeatureAssignments(prev => ({ ...prev, [storyKey]: feat.id }));
      setNewFeatureFor(null);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setCreatingFeature(false);
    }
  };

  const toggleFilter = (status) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const result = await api.post('/import/confirm', {
        import_id: importId,
        feature_assignments: featureAssignments,
      });
      setImportResult(result);
      toast.success(`Imported ${result.imported} stories`);
    } catch (err) {
      setError(err.data?.error || err.message);
      toast.error('Import failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleRestoreFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        setRestoreData(data);
        setShowRestoreConfirm(true);
      } catch {
        toast.error('Invalid JSON file');
      }
    };
    reader.readAsText(f);
    e.target.value = '';
  };

  const handleRestore = async () => {
    setRestoring(true);
    setShowRestoreConfirm(false);
    try {
      const result = await api.post('/import/restore', restoreData);
      toast.success(`Database restored: ${result.restored.projects} projects, ${result.restored.stories} stories`);
      setRestoreData(null);
    } catch (err) {
      toast.error(err.data?.error || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setImportId(null);
    setError(null);
    setImportResult(null);
    setFeatureAssignments({});
  };

  const filteredPreview = preview?.filter(row => activeFilters.has(row.diff_status)) || [];

  const truncate = (str, len = 60) => {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  };

  // Group features by project for the dropdown
  const featuresByProject = {};
  for (const f of features) {
    const pName = f.project_name || 'Unassigned';
    if (!featuresByProject[pName]) featuresByProject[pName] = [];
    featuresByProject[pName].push(f);
  }

  // Success state
  if (importResult) {
    return (
      <div className="max-w-2xl mx-auto mt-16">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete</h2>
          <p className="text-gray-600 mb-6">
            Successfully processed {importResult.imported} stories.
          </p>
          <div className="flex justify-center gap-3 mb-6">
            {Object.entries(importResult.summary).map(([status, count]) => (
              <span key={status} className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${DIFF_COLORS[status].badge}`}>
                {count} {DIFF_COLORS[status].label}
              </span>
            ))}
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              View Projects
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
            >
              Import Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Import Stories</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Restore from Backup */}
      {!preview && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <DatabaseBackup className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Restore from Backup</h3>
              <p className="text-xs text-gray-500">Upload a previously exported JSON backup to restore your data</p>
            </div>
          </div>
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoring}
            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            {restoring ? 'Restoring...' : 'Choose Backup File'}
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRestoreConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Restore Database</h3>
            <p className="text-sm text-gray-600 mb-2">
              This will <strong>replace all existing data</strong> with the backup contents. This action cannot be undone.
            </p>
            {restoreData?.exported_at && (
              <p className="text-xs text-gray-500 mb-4">
                Backup created: {new Date(restoreData.exported_at).toLocaleString()}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowRestoreConfirm(false); setRestoreData(null); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Format Help */}
      {!preview && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
          >
            <div className="p-2 bg-blue-50 rounded-lg">
              <Info className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900">CSV Format Guide</h3>
              <p className="text-xs text-gray-500">View expected columns, example file, and tips</p>
            </div>
            {showHelp ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showHelp && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
              {/* Column Reference */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Expected Columns</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1.5 pr-4 text-xs font-medium text-gray-500">Column</th>
                        <th className="text-left py-1.5 pr-4 text-xs font-medium text-gray-500">Required</th>
                        <th className="text-left py-1.5 text-xs font-medium text-gray-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-gray-600">
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Issue key</td>
                        <td className="py-1.5 pr-4"><span className="text-red-600 font-medium">Yes</span></td>
                        <td className="py-1.5">Unique identifier (e.g. PROJ-1). Rows without this are skipped.</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Summary</td>
                        <td className="py-1.5 pr-4"><span className="text-red-600 font-medium">Yes</span></td>
                        <td className="py-1.5">Story title or description</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Sprint</td>
                        <td className="py-1.5 pr-4"><span className="text-gray-400">No</span></td>
                        <td className="py-1.5">Sprint name (e.g. Sprint 1)</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Status</td>
                        <td className="py-1.5 pr-4"><span className="text-gray-400">No</span></td>
                        <td className="py-1.5">e.g. To Do, In Progress, Done</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Assignee</td>
                        <td className="py-1.5 pr-4"><span className="text-gray-400">No</span></td>
                        <td className="py-1.5">Team member name (matched case-insensitively)</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Story Points</td>
                        <td className="py-1.5 pr-4"><span className="text-gray-400">No</span></td>
                        <td className="py-1.5">Integer estimate. Also accepts <span className="font-mono">Story point estimate</span>. Defaults to 0.</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pr-4 font-mono font-medium text-gray-800">Resolved</td>
                        <td className="py-1.5 pr-4"><span className="text-gray-400">No</span></td>
                        <td className="py-1.5">Completion date (e.g. 2026-03-10). Also accepts <span className="font-mono">Release Date</span>.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Example CSV */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Example CSV</h4>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto font-mono leading-relaxed">
{`Issue key,Summary,Sprint,Status,Assignee,Story Points,Resolved
PROJ-1,User login page,Sprint 1,In Progress,John Doe,3,
PROJ-2,Password reset flow,Sprint 1,Done,Jane Smith,5,2026-03-10
PROJ-3,Dashboard widgets,Sprint 2,To Do,,8,`}
                </pre>
              </div>

              {/* Tips */}
              <div>
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Tips</h4>
                <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                  <li>Accepts <span className="font-mono">.csv</span> and <span className="font-mono">.json</span> files</li>
                  <li>Column headers are case-insensitive</li>
                  <li>Unmatched assignee names will show a warning but won't block the import</li>
                  <li>You can assign stories to features during the preview step</li>
                  <li>The system diffs against existing stories to show what's new, updated, carried over, or closed</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Upload Zone */}
      {!preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-1">
              Drag & drop your file here
            </p>
            <p className="text-sm text-gray-500 mb-4">or click to browse</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
            >
              Browse Files
            </button>
            <p className="text-xs text-gray-400 mt-3">Accepts .csv and .json files</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {file && (
            <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {file && (
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload & Preview
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Preview Section */}
      {preview && (
        <div>
          {/* Summary Bar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700 mr-1">Summary:</span>
            {Object.entries(summary).map(([status, count]) => (
              <span key={status} className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${DIFF_COLORS[status].badge}`}>
                {count} {DIFF_COLORS[status].label}
              </span>
            ))}
            <span className="text-sm text-gray-500 ml-auto">
              {preview.length} total rows
            </span>
          </div>

          {/* Filter Toggles */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            {Object.entries(DIFF_COLORS).map(([status, colors]) => (
              <button
                key={status}
                onClick={() => toggleFilter(status)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                  activeFilters.has(status)
                    ? `${colors.badge} border-transparent`
                    : 'bg-white text-gray-400 border-gray-200'
                }`}
              >
                {colors.label} ({summary[status]})
              </button>
            ))}
          </div>

          {/* Preview Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Key</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Summary</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Sprint</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Assignee</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 text-right">SP</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">Release</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3 min-w-[180px]">Feature</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview.map((row) => {
                    const colors = DIFF_COLORS[row.diff_status];
                    return (
                      <tr key={row.key} className={`border-b border-gray-100 ${colors.bg}`}>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                            {colors.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono text-gray-700">{row.key}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-900" title={row.summary}>
                          {truncate(row.summary)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{row.sprint || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{row.status || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            {row.assignee || '—'}
                            {row.assignee && !row.assignee_id && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Unmatched assignee" />
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-600 text-right">{row.story_points || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{row.release_date || '—'}</td>
                        <td className="px-4 py-2.5">
                          {newFeatureFor === row.key ? (
                            <div className="flex items-center gap-1">
                              <select
                                value={newFeatureProjectId}
                                onChange={(e) => setNewFeatureProjectId(e.target.value)}
                                className="w-20 text-xs px-1 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                              >
                                {projects.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={newFeatureName}
                                onChange={(e) => setNewFeatureName(e.target.value)}
                                placeholder="Feature name"
                                className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none min-w-0"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCreateFeature(row.key);
                                  if (e.key === 'Escape') setNewFeatureFor(null);
                                }}
                              />
                              <button
                                onClick={() => handleCreateFeature(row.key)}
                                disabled={creatingFeature || !newFeatureName.trim()}
                                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {creatingFeature ? '…' : '✓'}
                              </button>
                              <button
                                onClick={() => setNewFeatureFor(null)}
                                className="text-xs px-1 py-1 text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <select
                              value={featureAssignments[row.key] || ''}
                              onChange={(e) => handleFeatureAssignment(row.key, e.target.value)}
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                            >
                              <option value="">No feature</option>
                              {Object.entries(featuresByProject).map(([projectName, feats]) => (
                                <optgroup key={projectName} label={projectName}>
                                  {feats.map(f => (
                                    <option key={f.id} value={f.id}>{f.name}</option>
                                  ))}
                                </optgroup>
                              ))}
                              <option value="__new__">+ New Feature…</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredPreview.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                        No rows match the selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confirm Section */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Confirm Import
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
