import { createContext, useContext, useState, useCallback } from 'react';

const LoadingContext = createContext(null);

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used within LoadingBarProvider');
  return ctx;
}

export default function LoadingBarProvider({ children }) {
  const [count, setCount] = useState(0);

  const start = useCallback(() => setCount((c) => c + 1), []);
  const done = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <LoadingContext.Provider value={{ start, done, isLoading: count > 0 }}>
      {count > 0 && (
        <div className="fixed top-0 left-0 right-0 z-[200] h-0.5">
          <div className="h-full bg-blue-500 animate-loading-bar" />
        </div>
      )}
      {children}
    </LoadingContext.Provider>
  );
}
