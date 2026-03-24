import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const MentionList = forwardRef(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => setSelectedIndex(0), [items]);

  useEffect(() => {
    const el = containerRef.current?.children[selectedIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command({ id: item.id, label: item.name });
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-56 max-h-48 overflow-y-auto">
      {items.map((item, index) => {
        const initials = item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        return (
          <button
            key={item.id}
            onClick={() => command({ id: item.id, label: item.name })}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
              index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
              style={{ backgroundColor: item.color || '#6b7280' }}
            >
              {initials}
            </div>
            <span className="font-medium truncate">{item.name}</span>
          </button>
        );
      })}
    </div>
  );
});

MentionList.displayName = 'MentionList';

export default MentionList;
