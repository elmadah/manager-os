import { StickyNote } from 'lucide-react';
import NotesPanel from '../components/NotesPanel';

export default function NotesPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex p-2 rounded-lg bg-yellow-50 text-yellow-600">
          <StickyNote size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
          <p className="text-sm text-gray-500">All notes across projects, features, and team members</p>
        </div>
      </div>

      <NotesPanel showSearch={true} />
    </div>
  );
}
