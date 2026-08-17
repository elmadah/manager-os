import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const ARRAY_KEYS = ['sprint', 'repo', 'author'];
const SCALAR_KEYS = ['scope', 'release', 'from', 'to', 'state', 'project', 'reviewer'];

/**
 * Filter state lives in the URL so any view is bookmarkable and shareable.
 * The URL is the single source of truth — there is no duplicate local copy.
 */
export default function usePrFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = { scope: searchParams.get('scope') || 'all' };
    ARRAY_KEYS.forEach((key) => {
      result[key] = searchParams.getAll(key);
    });
    SCALAR_KEYS.forEach((key) => {
      if (key !== 'scope') result[key] = searchParams.get(key) || '';
    });
    return result;
  }, [searchParams]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      next.delete(key);
      if (Array.isArray(value)) {
        value.forEach((v) => next.append(key, v));
      } else if (value !== '' && value != null) {
        next.set(key, value);
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const toggleArrayValue = useCallback(
    (key, value) => {
      const current = searchParams.getAll(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setFilter(key, next);
    },
    [searchParams, setFilter]
  );

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
  }, [setSearchParams]);

  const queryString = searchParams.toString();

  return { filters, setFilter, toggleArrayValue, clearAll, queryString };
}
