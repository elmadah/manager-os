import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  // Pad start (Monday = 0)
  let startPad = firstDay.getDay() - 1;
  if (startPad < 0) startPad = 6;
  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push({ date: d, inMonth: false });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }

  // Pad end
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - lastDay.getDate() - startPad + 1);
    days.push({ date: d, inMonth: false });
  }

  return days;
}

function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function TimelineSidebar({ data, onDateClick }) {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  const calendarDays = getCalendarDays(calYear, calMonth);
  const todayStr = formatDateStr(today);

  // Build agenda from data
  const agenda = [];
  if (data?.team_members) {
    for (const member of data.team_members) {
      for (const project of member.projects) {
        for (const feature of project.features) {
          agenda.push({
            ...feature,
            projectName: project.name,
            projectColor: project.color || '#3B82F6',
          });
        }
      }
    }
  }
  // Deduplicate by feature id
  const uniqueAgenda = [...new Map(agenda.map(a => [a.id, a])).values()];
  // Sort by start_date
  uniqueAgenda.sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Group agenda by date category
  const todayItems = uniqueAgenda.filter(a => a.start_date <= todayStr && a.target_date >= todayStr);
  const upcomingItems = uniqueAgenda.filter(a => a.start_date > todayStr).slice(0, 5);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  return (
    <div className="w-72 shrink-0">
      {/* Mini Calendar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {MONTH_NAMES[calMonth]} {calYear}
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
              <ChevronLeft size={14} className="text-gray-500" />
            </button>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
              <ChevronRight size={14} className="text-gray-500" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0">
          {DAY_HEADERS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
          {calendarDays.map(({ date, inMonth }, i) => {
            const dateStr = formatDateStr(date);
            const isToday = dateStr === todayStr;
            return (
              <button
                key={i}
                onClick={() => onDateClick(dateStr)}
                className={`text-center text-xs py-1.5 rounded transition-colors ${
                  isToday
                    ? 'bg-blue-600 text-white font-bold'
                    : inMonth
                    ? 'text-gray-700 hover:bg-gray-100'
                    : 'text-gray-300'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {todayItems.length > 0 && (
          <>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Today</h4>
            {todayItems.map(item => (
              <AgendaItem key={item.id} item={item} />
            ))}
          </>
        )}

        {upcomingItems.length > 0 && (
          <>
            <h4 className={`text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 ${todayItems.length > 0 ? 'mt-4' : ''}`}>
              Upcoming
            </h4>
            {upcomingItems.map(item => (
              <AgendaItem key={item.id} item={item} />
            ))}
          </>
        )}

        {todayItems.length === 0 && upcomingItems.length === 0 && (
          <p className="text-xs text-gray-400 italic">No scheduled items</p>
        )}
      </div>
    </div>
  );
}

function AgendaItem({ item }) {
  const startDate = new Date(item.start_date + 'T00:00:00');
  const endDate = new Date(item.target_date + 'T00:00:00');
  const opts = { month: 'short', day: 'numeric' };

  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-start gap-2">
        <div
          className="w-2 h-2 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: item.projectColor }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
          <div className="text-xs text-gray-500">
            {startDate.toLocaleDateString('en-US', opts)} - {endDate.toLocaleDateString('en-US', opts)}
          </div>
          {item.assignees?.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              {item.assignees.slice(0, 3).map(a => (
                <div
                  key={a.id}
                  className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: hexToRgba(item.projectColor, 0.7) }}
                  title={a.name}
                >
                  {a.name.charAt(0)}
                </div>
              ))}
              {item.assignees.length > 3 && (
                <span className="text-xs text-gray-400">+{item.assignees.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
