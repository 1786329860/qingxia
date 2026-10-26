import { useSyncExternalStore } from 'react';

const eventName = 'qingxia:preferences';
function read(key: string) {
  try {
    return localStorage.getItem(key) || '[]';
  } catch {
    return '[]';
  }
}
function parse(value: string): string[] {
  try {
    const list: unknown = JSON.parse(value);
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
function write(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    /* Storage can be disabled by the browser. */
  }
  window.dispatchEvent(new Event(eventName));
}
function subscribe(onChange: () => void) {
  window.addEventListener(eventName, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(eventName, onChange);
    window.removeEventListener('storage', onChange);
  };
}
function useList(key: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => '[]',
  );
  return parse(raw);
}
export function useFavorites() {
  const favorites = useList('qingxia:favorites');
  const toggleFavorite = (id: string) => {
    const current = parse(read('qingxia:favorites'));
    write(
      'qingxia:favorites',
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };
  return { favorites, toggleFavorite, isFavorite: (id: string) => favorites.includes(id) };
}
export function rememberTool(id: string) {
  const current = parse(read('qingxia:recent'));
  write('qingxia:recent', [id, ...current.filter((item) => item !== id)].slice(0, 12));
}
export function useRecentTools() {
  const recent = useList('qingxia:recent');
  return { recent, rememberTool, clearRecent: () => write('qingxia:recent', []) };
}
