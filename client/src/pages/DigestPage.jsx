import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Newspaper, Calendar, Copy, Download, FileText, Loader2 } from 'lucide-react';
import api from '../lib/api';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getThisWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return { from: formatDate(monday), to: formatDate(now) };
}

function getLastWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  return { from: formatDate(lastMonday), to: formatDate(lastSunday) };
}

export default function DigestPage() {
  const defaultRange = getThisWeekRange();
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/digest?from=${fromDate}&to=${toDate}`);
      setMarkdown(data.markdown);
      setGenerated(true);
    } catch (err) {
      setError(err.data?.error || 'Failed to generate digest');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickRange(rangeFn) {
    const range = rangeFn();
    setFromDate(range.from);
    setToDate(range.to);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-digest-${fromDate}-to-${toDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Newspaper className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Weekly Digest</h1>
          <p className="text-sm text-gray-500 mt-0.5">Generate a status report for any date range</p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleQuickRange(getThisWeekRange)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              This Week
            </button>
            <button
              onClick={() => handleQuickRange(getLastWeekRange)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Last Week
            </button>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate Digest
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}
      </div>

      {/* Results */}
      {generated && (
        <>
          {/* Action bar */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Copy className="h-4 w-4" />
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download .md
            </button>
          </div>

          {/* Two-panel view */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Markdown preview */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview</span>
              </div>
              <div className="p-6 prose prose-sm prose-gray max-w-none overflow-auto max-h-[70vh]">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            </div>

            {/* Right: Raw markdown editor */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Markdown</span>
              </div>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="w-full h-[70vh] p-4 font-mono text-sm text-gray-800 resize-none focus:outline-none"
                spellCheck={false}
              />
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!generated && !loading && (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">No digest generated yet</h3>
          <p className="text-sm text-gray-500">Select a date range and click Generate Digest to create your weekly status report.</p>
        </div>
      )}
    </div>
  );
}
