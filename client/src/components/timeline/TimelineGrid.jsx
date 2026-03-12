import TimelineMemberRow from './TimelineMemberRow';

function getDaysInRange(start, end) {
  const days = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getWeeksInRange(start, end) {
  const weeks = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());
    weeks.push({ start: new Date(weekStart), end: new Date(weekEnd) });
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TimelineGrid({ data, dateRange, view }) {
  const today = formatDate(new Date());
  const days = getDaysInRange(dateRange.start, dateRange.end);
  const rangeDays = days.length;

  // Calculate today line position
  const todayDate = new Date(today + 'T00:00:00');
  const rangeStartDate = new Date(dateRange.start + 'T00:00:00');
  const todayOffset = (todayDate - rangeStartDate) / (1000 * 60 * 60 * 24);
  const todayPercent = (todayOffset / rangeDays) * 100;
  const showTodayLine = todayPercent >= 0 && todayPercent <= 100;

  if (view === 'week') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Column headers */}
        <div className="flex border-b border-gray-200">
          <div className="w-48 shrink-0 px-4 py-3 bg-gray-50 border-r border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Team Members</span>
          </div>
          <div className="flex-1 flex">
            {days.map(day => {
              const isToday = formatDate(day) === today;
              return (
                <div
                  key={formatDate(day)}
                  className={`flex-1 text-center py-3 border-r border-gray-100 last:border-r-0 ${
                    isToday ? 'bg-blue-50' : 'bg-gray-50'
                  }`}
                >
                  <div className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                    {day.getDate()} {DAY_NAMES[day.getDay()]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {showTodayLine && (
            <div
              className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-blue-300 z-10 pointer-events-none"
              style={{ left: `calc(12rem + ${todayPercent}% * (100% - 12rem) / 100%)` }}
            />
          )}
          {data.team_members?.map(member => (
            <TimelineMemberRow
              key={member.id}
              member={member}
              rangeStart={dateRange.start}
              rangeDays={rangeDays}
            />
          ))}
          {(!data.team_members || data.team_members.length === 0) && (
            <div className="text-center py-12 text-gray-400">
              No team members found. Add team members to see the timeline.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Month view
  const weeks = getWeeksInRange(dateRange.start, dateRange.end);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Column headers */}
      <div className="flex border-b border-gray-200">
        <div className="w-48 shrink-0 px-4 py-3 bg-gray-50 border-r border-gray-200">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Team Members</span>
        </div>
        <div className="flex-1 flex">
          {weeks.map((week, i) => (
            <div
              key={i}
              className="flex-1 text-center py-3 border-r border-gray-100 last:border-r-0 bg-gray-50"
            >
              <div className="text-xs font-medium text-gray-500">
                {MONTH_SHORT[week.start.getMonth()]} {week.start.getDate()} - {week.end.getDate()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="relative">
        {showTodayLine && (
          <div
            className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-blue-300 z-10 pointer-events-none"
            style={{ left: `calc(12rem + ${todayPercent}% * (100% - 12rem) / 100%)` }}
          />
        )}
        {data.team_members?.map(member => (
          <TimelineMemberRow
            key={member.id}
            member={member}
            rangeStart={dateRange.start}
            rangeDays={rangeDays}
          />
        ))}
        {(!data.team_members || data.team_members.length === 0) && (
          <div className="text-center py-12 text-gray-400">
            No team members found. Add team members to see the timeline.
          </div>
        )}
      </div>
    </div>
  );
}
