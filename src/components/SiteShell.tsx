import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Command,
  Grid2X2,
  Heart,
  History,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { categories, getTool, tools } from '../lib/registry';
import { useFavorites } from '../lib/preferences';

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="轻匣首页">
      <span className="brand-mark">
        <Box size={26} strokeWidth={1.8} />
      </span>
      <span>
        轻匣<small>QINGXIA</small>
      </span>
      <span className="brand-dot" />
    </Link>
  );
}
export default function SiteShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('qingxia:theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const { favorites } = useFavorites();
  const query = new URLSearchParams(location.search);
  const activeCategory = query.get('category');
  const activeView = query.get('view');
  const currentTool = location.pathname.startsWith('/tool/')
    ? getTool(location.pathname.split('/').pop() || '')
    : undefined;
  const pageName =
    currentTool?.name ||
    (location.pathname === '/privacy'
      ? '隐私说明'
      : location.pathname === '/about'
        ? '关于轻匣'
        : location.pathname.startsWith('/admin')
          ? '站长后台'
          : activeView === 'favorites'
            ? '我的收藏'
            : activeView === 'recent'
              ? '最近使用'
              : '全部工具');
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = contentRef.current?.animate(
      [
        { opacity: 0.78, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return () => animation?.cancel();
  }, [location.pathname]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setIsMobile(query.matches);
      if (!query.matches) setMenuOpen(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('qingxia:theme', theme);
    } catch {
      /* Theme remains available in memory. */
    }
  }, [theme]);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') || [],
      );
    focusable()[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
      previouslyFocused?.focus();
    };
  }, [menuOpen]);
  const focusSearch = () => {
    if (location.pathname !== '/') {
      navigate('/?search=1');
      return;
    }
    window.dispatchEvent(new Event('qingxia:focus-search'));
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        location.pathname !== '/' &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        navigate('/?search=1');
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [location.pathname, navigate]);
  return (
    <div className="site-shell">
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        id="site-sidebar"
        ref={sidebarRef}
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
        inert={isMobile && !menuOpen}
        aria-hidden={isMobile && !menuOpen}
        aria-label="主导航"
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen || undefined}
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="关闭导航"
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-tagline">你的日常，轻一点。</div>
        <nav className="primary-nav">
          <Link
            className={`nav-item ${location.pathname === '/' && !activeCategory && !activeView ? 'active' : ''}`}
            to="/"
          >
            <Grid2X2 size={18} />
            <span>全部工具</span>
            <span className="nav-count">{tools.length}</span>
          </Link>
          <Link
            className={`nav-item ${activeView === 'favorites' ? 'active' : ''}`}
            to="/?view=favorites"
          >
            <Heart size={18} />
            <span>我的收藏</span>
            {favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}
          </Link>
          <Link
            className={`nav-item ${activeView === 'recent' ? 'active' : ''}`}
            to="/?view=recent"
          >
            <History size={18} />
            <span>最近使用</span>
          </Link>
          <div className="nav-section-label">
            探索工具 <span>按分类浏览</span>
          </div>
          {categories.map((category) => {
            const Icon = category.icon;
            const count = tools.filter((tool) => tool.category === category.id).length;
            if (!count) return null;
            return (
              <Link
                className={`nav-item ${activeCategory === category.id || currentTool?.category === category.id ? 'active' : ''}`}
                key={category.id}
                to={`/?category=${category.id}`}
              >
                <Icon size={18} />
                <span>{category.label}</span>
                <span className="nav-count">{count.toString().padStart(2, '0')}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/privacy" className="privacy-card">
            <span className="privacy-symbol">
              <ShieldCheck size={21} />
            </span>
            <strong>安心，是默认选项</strong>
            <span>本地优先 · 不收集文件内容</span>
            <ArrowUpRight size={16} className="privacy-arrow" />
          </Link>
          <div className="sidebar-links">
            <NavLink to="/about">关于轻匣</NavLink>
            <span>·</span>
            <NavLink to="/privacy">隐私说明</NavLink>
            <span className="version">v0.1</span>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              aria-expanded={menuOpen}
              aria-controls="site-sidebar"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-home">工作台</span>
            <ChevronRight size={13} className="breadcrumb-divider" />
            <span className="breadcrumb-current">{pageName}</span>
          </div>
          <div className="topbar-actions">
            <span className="topbar-status">
              <span className="status-dot" />
              无需登录，打开即用
            </span>
            <button className="topbar-search" onClick={focusSearch} aria-label="搜索工具">
              <Search size={16} />
              <span>快速查找</span>
              <kbd>
                <Command size={11} /> K
              </kbd>
            </button>
            <span className="topbar-separator" />
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1} ref={contentRef}>
          {children}
        </main>
        <footer className="site-footer">
          <span>
            <Box size={14} />
            轻匣 <span className="footer-divider">/</span> 为每一个日常，留一点轻松。
          </span>
          <span>
            <Check size={13} />
            免费使用<span className="footer-dot">·</span>无广告<span className="footer-dot">·</span>
            <Link to="/privacy">隐私优先</Link>
            <Sparkles size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}
