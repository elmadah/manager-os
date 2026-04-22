import { ExternalLink, Info } from 'lucide-react';
import SettingsTabs from '../components/SettingsTabs';

export default function AboutPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

      <SettingsTabs />

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">ManagerOS</h2>
            <p className="text-sm text-gray-500">
              Open-source tool for managing projects, teams, and execution workflows.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Maintained by <span className="font-semibold text-gray-900">Ahmed Elmadah</span>
          </p>

          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-gray-600">Report an issue</p>
            <p className="text-sm text-gray-600">Contribute</p>
            <a
              href="https://github.com/elmadah/manager-os"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
