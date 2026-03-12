import { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import TimelineControls from './TimelineControls';
import TimelineGrid from './TimelineGrid';
import TimelineSidebar from './TimelineSidebar';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function getMonthRange(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: formatDate(start), end: formatDate(end) };
}

export default function Timeline() {
  const [view, setView] = useState('week');
  const [dateRange, setDateRange] = useState(() => getWeekRange(new Date()));
  const [data, setData] = useState({ team_members: [] });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.get(`/timeline?start_date=${dateRange.start}&end_date=${dateRange.end}`);
      setData(result);
    } catch (err) {
      console.error('Failed to load timeline data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleViewChange = (newView) => {
    setView(newView);
    const midDate = new Date(dateRange.start + 'T00:00:00');
    if (newView === 'week') {
      setDateRange(getWeekRange(midDate));
    } else {
      setDateRange(getMonthRange(midDate));
    }
  };

  const handlePrev = () => {
    const start = new Date(dateRange.start + 'T00:00:00');
    if (view === 'week') {
      start.setDate(start.getDate() - 7);
      setDateRange(getWeekRange(start));
    } else {
      start.setMonth(start.getMonth() - 1);
      setDateRange(getMonthRange(start));
    }
  };

  const handleNext = () => {
    const start = new Date(dateRange.start + 'T00:00:00');
    if (view === 'week') {
      start.setDate(start.getDate() + 7);
      setDateRange(getWeekRange(start));
    } else {
      start.setMonth(start.getMonth() + 1);
      setDateRange(getMonthRange(start));
    }
  };

  const handleToday = () => {
    if (view === 'week') {
      setDateRange(getWeekRange(new Date()));
    } else {
      setDateRange(getMonthRange(new Date()));
    }
  };

  const handleDateClick = (dateStr) => {
    setView('week');
    setDateRange(getWeekRange(new Date(dateStr + 'T00:00:00')));
  };

  if (loading && data.team_members.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-400">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div>
      <TimelineControls
        dateRange={dateRange}
        view={view}
        onViewChange={handleViewChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
      />
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <TimelineGrid data={data} dateRange={dateRange} view={view} />
        </div>
        <TimelineSidebar data={data} onDateClick={handleDateClick} />
      </div>
    </div>
  );
}
