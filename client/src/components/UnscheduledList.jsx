import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

export default function UnscheduledList({ unscheduled }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const projects = unscheduled?.projects || [];
  const features = unscheduled?.features || [];
  const total = projects.length + features.length;
  if (total === 0) return null;

  return (
    <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-900"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <AlertCircle size={14} />
        Unscheduled ({total}) — items missing start or target dates
      </button>
      {open && (
        <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {projects.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-700 mb-1">Projects</div>
              <ul>
                {projects.slice(0, 10).map(p => (
                  <li key={p.id}>
                    <button onClick={() => navigate(`/projects/${p.id}`)} className="hover:underline text-amber-900">
                      {p.name}
                    </button>
                  </li>
                ))}
                {projects.length > 10 && <li className="text-amber-700">…and {projects.length - 10} more</li>}
              </ul>
            </div>
          )}
          {features.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-amber-700 mb-1">Features</div>
              <ul>
                {features.slice(0, 10).map(f => (
                  <li key={f.id}>
                    <button onClick={() => navigate(`/projects/${f.project_id}`)} className="hover:underline text-amber-900">
                      {f.name}
                    </button>
                  </li>
                ))}
                {features.length > 10 && <li className="text-amber-700">…and {features.length - 10} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
