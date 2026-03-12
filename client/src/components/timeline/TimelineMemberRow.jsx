import { useState } from 'react';
import { User } from 'lucide-react';
import { ProjectBar, FeatureBar } from './TimelineBar';

export default function TimelineMemberRow({ member, rangeStart, rangeDays }) {
  const [expandedProjects, setExpandedProjects] = useState({});

  const toggleProject = (projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  // Calculate how many rows this member needs
  let totalRows = 0;
  for (const project of member.projects) {
    totalRows += 1; // project bar
    if (expandedProjects[project.id]) {
      totalRows += project.features.length;
    }
  }
  totalRows = Math.max(totalRows, 1);

  const rowHeight = 36;
  const containerHeight = totalRows * rowHeight + 8;

  // Build bars
  const bars = [];
  let currentRow = 0;

  for (const project of member.projects) {
    if (project.start_date && project.target_date) {
      bars.push(
        <ProjectBar
          key={`p-${project.id}`}
          project={project}
          rangeStart={rangeStart}
          rangeDays={rangeDays}
          expanded={!!expandedProjects[project.id]}
          onToggle={() => toggleProject(project.id)}
        />
      );
    }
    currentRow += 1;

    if (expandedProjects[project.id]) {
      for (const feature of project.features) {
        bars.push(
          <FeatureBar
            key={`f-${feature.id}`}
            feature={feature}
            color={project.color || '#3B82F6'}
            rangeStart={rangeStart}
            rangeDays={rangeDays}
            rowIndex={currentRow}
          />
        );
        currentRow += 1;
      }
    }
  }

  return (
    <div className="flex border-b border-gray-100 last:border-b-0">
      {/* Member name column */}
      <div className="w-48 shrink-0 flex items-start gap-2 px-4 py-3 border-r border-gray-100">
        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
          <User size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{member.name}</div>
          {member.role && (
            <div className="text-xs text-gray-400 truncate">{member.role}</div>
          )}
        </div>
      </div>

      {/* Timeline bars area */}
      <div className="flex-1 relative" style={{ minHeight: `${containerHeight}px` }}>
        {member.projects.length === 0 ? (
          <div className="flex items-center h-full px-4">
            <span className="text-xs text-gray-300 italic">No scheduled work</span>
          </div>
        ) : (
          bars
        )}
      </div>
    </div>
  );
}
