import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { analyticsEnabled } from '../lib/analytics';
import { memberStorageKey } from '../lib/member-storage';

const SessionContext = createContext<{ session: Session | null; ready: boolean }>({
  session: null,
  ready: false,
});
export const useMember = () => useContext(SessionContext);
export const memberAuth = () => import('../lib/supabase-auth').then((m) => m.authClient);

function usable(session: Session | null) {
  return session?.user.email_confirmed_at && !session.user.is_anonymous ? session : null;
}

export function MemberSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    let subscribing = false;
    let unsubscribe: (() => void) | undefined;
    async function subscribe() {
      try {
        const auth = await memberAuth();
        if (!live) return;
        const { data } = auth.onAuthStateChange((event, next) => {
          if (event !== 'INITIAL_SESSION') {
            setSession(usable(next));
            setReady(true);
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const stored = await auth.getSession();
        if (live && !stored.data.session) setReady(true);
        if (stored.data.session) {
          const { data, error } = await auth.getUser();
          if (live) {
            setSession(
              !error && data.user ? usable({ ...stored.data.session, user: data.user }) : null,
            );
            setReady(true);
          }
        }
      } catch {
        if (live) setReady(true);
      }
    }
    const listen = () => {
      if (subscribing) return;
      subscribing = true;
      void subscribe();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === memberStorageKey) listen();
    };
    window.addEventListener('qingxia:account', listen);
    window.addEventListener('storage', storage);
    try {
      if (localStorage.getItem(memberStorageKey)) listen();
      else setReady(true);
    } catch {
      listen();
    }
    return () => {
      live = false;
      unsubscribe?.();
      window.removeEventListener('qingxia:account', listen);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return (
    <SessionContext.Provider value={{ session, ready }}>
      <MemberActivity />
      {children}
    </SessionContext.Provider>
  );
}

function MemberActivity() {
  const { session } = useMember();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!session || pathname.startsWith('/admin') || !analyticsEnabled()) return;
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format();
    const key = 'qingxia:last-member-activity';
    const value = session.user.id + ':' + day;
    try {
      if (sessionStorage.getItem(key) === value) return;
    } catch {
      // The database still deduplicates activity when browser storage is restricted.
    }
    void fetch('/api/community?kind=activity', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token },
      keepalive: true,
    })
      .then((response) => {
        if (response.ok) sessionStorage.setItem(key, value);
      })
      .catch(() => {});
  }, [session, pathname]);
  return null;
}

export function MemberGate({ wall = false }: { wall?: boolean }) {
  const { pathname } = useLocation();
  const { ready } = useMember();
  return (
    <div className="member-gate">
      <div className="member-gate-badge" aria-hidden="true">
        <LockKeyhole size={24} />
        <span>轻匣账号</span>
      </div>
      <div>
        <h2>{wall ? '登录后写一张便利贴' : '登录后使用这个工具'}</h2>
        <p>
          {wall
            ? '轻匣用户可以阅读、发布留言和查看站长回复。'
            : '注册和工具使用始终免费，本地文件依然留在你的浏览器。'}
        </p>
        <div className="member-gate-perks">
          <span>
            <Check size={13} aria-hidden="true" /> 免费使用
          </span>
          <span>
            <ShieldCheck size={13} aria-hidden="true" /> 文件处理在本地
          </span>
          <span>
            <Sparkles size={13} aria-hidden="true" /> 无广告
          </span>
        </div>
      </div>
      {ready || typeof window === 'undefined' ? (
        <Link
          className="button button-primary"
          to={'/account?next=' + encodeURIComponent(pathname)}
        >
          登录 / 注册
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      ) : (
        <p role="status">正在检查登录状态…</p>
      )}
    </div>
  );
}
