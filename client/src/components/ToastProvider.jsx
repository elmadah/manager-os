import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICON_MAP = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const STYLE_MAP = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-blue-600',
};

let toastId = 0;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 6000),
    info: (msg) => addToast(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICON_MAP[t.type] || Info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-slide-up ${STYLE_MAP[t.type]}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
