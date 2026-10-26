export type ToolOutcome = 'success' | 'error';
export function analyticsEnabled() {
  try {
    return localStorage.getItem('qingxia:analytics-off') !== 'true' && navigator.doNotTrack !== '1';
  } catch {
    return false;
  }
}
function visitor() {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  try {
    const key = `qingxia:visitor:${day}`;
    let id = localStorage.getItem(key);
    if (!id) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const old = localStorage.key(i);
        if (old?.startsWith('qingxia:visitor:')) localStorage.removeItem(old);
      }
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
function send(body: Record<string, string>) {
  if (!analyticsEnabled() || location.pathname.startsWith('/admin')) return;
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, visitor: visitor() }),
    keepalive: true,
  }).catch(() => {});
}
export function trackPageView(path: string) {
  send({ type: 'pageview', path: path.slice(0, 100) });
}
export function trackToolUse(tool: string, outcome: ToolOutcome = 'success') {
  send({ type: 'tool_use', tool, outcome });
}
