import { useState, useEffect } from 'react';
import {
  Settings,
  Loader2,
  Check,
  X,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../components/ToastProvider';
import SyncModal from '../components/SyncModal';

export default function SettingsPage() {
  const toast = useToast();

  // Jira settings state
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [patToken, setPatToken] = useState('');
  const [storyPointsField, setStoryPointsField] = useState('customfield_10026');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message }

  // Boards state
  const [boards, setBoards] = useState([]);
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [newBoardId, setNewBoardId] = useState('');
  const [newBoardLabel, setNewBoardLabel] = useState('');
  const [addingBoard, setAddingBoard] = useState(false);

  // Sync modal state
  const [syncBoard, setSyncBoard] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await api.get('/settings/jira');
      setConfigured(data.configured);
      if (data.configured) {
        setBaseUrl(data.base_url);
        setPatToken(data.pat_token);
        setStoryPointsField(data.story_points_field || 'customfield_10026');
      }
      setBoards(data.boards || []);
    } catch {
      // Not configured yet
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!baseUrl.trim() || !patToken.trim()) {
      toast.error('Base URL and PAT are required');
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      await api.put('/settings/jira', {
        base_url: baseUrl.trim(),
        pat_token: patToken.trim(),
        story_points_field: storyPointsField.trim(),
      });
      setConfigured(true);
      toast.success('Jira settings saved');
    } catch (err) {
      toast.error(err.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post('/settings/jira/test');
      setTestResult({ success: true, message: `Connected as ${result.user}` });
    } catch (err) {
      setTestResult({ success: false, message: err.data?.error || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleAddBoard() {
    if (!newBoardId.trim() || !newBoardLabel.trim()) return;
    setAddingBoard(true);
    try {
      const board = await api.post('/settings/jira/boards', {
        board_id: parseInt(newBoardId.trim(), 10),
        label: newBoardLabel.trim(),
      });
      setBoards((prev) => [...prev, board]);
      setNewBoardId('');
      setNewBoardLabel('');
      setShowAddBoard(false);
      toast.success('Board added');
    } catch (err) {
      toast.error(err.data?.error || 'Failed to add board');
    } finally {
      setAddingBoard(false);
    }
  }

  async function handleDeleteBoard(id) {
    try {
      await api.del(`/settings/jira/boards/${id}`);
      setBoards((prev) => prev.filter((b) => b.id !== id));
      toast.success('Board removed');
    } catch (err) {
      toast.error(err.data?.error || 'Failed to remove board');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Jira Connection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Jira Connection</h2>
            <p className="text-sm text-gray-500">Connect to your Jira Data Center instance</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://jira.yourcompany.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              The root URL of your Jira instance (no trailing slash)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Personal Access Token (PAT)
            </label>
            <input
              type="password"
              value={patToken}
              onChange={(e) => setPatToken(e.target.value)}
              placeholder={configured ? '••••••••' : 'Enter your PAT'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Generate in Jira: Profile → Personal Access Tokens → Create token
            </p>
          </div>

          {testResult && (
            <div
              className={`px-4 py-3 rounded-lg flex items-center gap-2 text-sm ${
                testResult.success
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              {testResult.message}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
            <button
              onClick={handleTest}
              disabled={testing || !configured}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Test Connection
            </button>
          </div>
        </div>
      </div>

      {/* Story Points Field */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Story Points Field</h2>
        <p className="text-sm text-gray-500 mb-4">
          The custom field ID used for story points in your Jira instance
        </p>
        <input
          type="text"
          value={storyPointsField}
          onChange={(e) => setStoryPointsField(e.target.value)}
          className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <p className="text-xs text-gray-400 mt-1">
          Common values: customfield_10026, customfield_10028. Check your Jira admin for the exact field ID.
        </p>
      </div>

      {/* Boards */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Boards</h2>
            <p className="text-sm text-gray-500">
              Register your Jira boards to sync sprints
            </p>
          </div>
          <button
            onClick={() => setShowAddBoard(true)}
            disabled={!configured}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Board
          </button>
        </div>

        {!configured && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Save your Jira connection settings above before adding boards.
          </p>
        )}

        {/* Add Board Inline Form */}
        {showAddBoard && (
          <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Board Label
                </label>
                <input
                  type="text"
                  value={newBoardLabel}
                  onChange={(e) => setNewBoardLabel(e.target.value)}
                  placeholder="e.g. Mobile Team"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Board ID
                </label>
                <input
                  type="number"
                  value={newBoardId}
                  onChange={(e) => setNewBoardId(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={handleAddBoard}
                disabled={addingBoard || !newBoardId.trim() || !newBoardLabel.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {addingBoard ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
              </button>
              <button
                onClick={() => {
                  setShowAddBoard(false);
                  setNewBoardId('');
                  setNewBoardLabel('');
                }}
                className="px-2 py-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Find the Board ID in your Jira board URL: /board/<strong>42</strong>
            </p>
          </div>
        )}

        {/* Board List */}
        {boards.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {boards.map((board) => (
              <div
                key={board.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {board.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    Board ID: {board.board_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSyncBoard(board)}
                    className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 text-sm font-medium flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync
                  </button>
                  <button
                    onClick={() => handleDeleteBoard(board.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          configured && (
            <p className="text-sm text-gray-500 text-center py-6">
              No boards registered yet. Add a board to start syncing sprints.
            </p>
          )
        )}
      </div>

      {/* Sync Modal */}
      {syncBoard && (
        <SyncModal
          board={syncBoard}
          onClose={() => setSyncBoard(null)}
        />
      )}
    </div>
  );
}
