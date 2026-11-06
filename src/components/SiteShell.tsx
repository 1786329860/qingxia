import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Box,
  CalendarClock,
  Check,
  Compass,
  CornerDownLeft,
  Grid2X2,
  Heart,
  History,
  ImagePlay,
  Layers,
  Menu,
  MessagesSquare,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { categories, getTool, tools } from '../lib/registry';
import { useFavorites } from '../lib/preferences';
import { useMember } from './MemberSession';

const communityPages: Record<string, string> = {
  '/wall': '留言墙',
  '/gifs': 'GIF 表情包',
  '/account': '我的账号',
  '/reminders': '纪念日提醒',
};

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="轻匣首页">
      <span className="brand-mark" aria-hidden="true">
        <Box size={20} strokeWidth={1.5} />
      </span>
      <span className="brand-wordmark">
        <span className="brand-latin">QINGXIA </span>
        <em>轻匣</em>
      </span>
    </Link>
  );
}

export default function SiteShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useMember();
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  const previousPath = useRef(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  useEffect(() => {
    if (!paletteOpen) return;
    paletteRef.current
      ?.querySelector('.command-palette-item.is-selected')
      ?.scrollIntoView({ block: 'nearest' });
  }, [paletteOpen, paletteIndex, paletteQuery]);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('qingxia:theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
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
    communityPages[location.pathname] ||
    (location.pathname === '/privacy'
      ? '隐私说明'
      : location.pathname === '/about'
        ? '关于轻匣'
        : location.pathname.startsWith('/admin')
          ? '站长工作台'
          : activeView === 'favorites'
            ? '我的收藏'
            : activeView === 'recent'
              ? '最近使用'
              : '工具箱');

  useEffect(() => {
    setMenuOpen(false);
    setPaletteOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = contentRef.current?.animate(
      [
        { opacity: 0.72, transform: 'translateY(10px) scale(0.996)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation?.cancel();
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#121315' : '#f6f4ee');
    try {
      localStorage.setItem('qingxia:theme', theme);
    } catch {
      /* Theme remains available in memory. */
    }
  }, [theme]);

  useEffect(() => {
    if (
      location.pathname !== '/' ||
      activeView ||
      !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches
    )
      return;
    let raf = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || raf) return;
      const x = event.clientX;
      const y = event.clientY;
      raf = requestAnimationFrame(() => {
        raf = 0;
        ambientRef.current?.style.setProperty('--cursor-x', `${x}px`);
        ambientRef.current?.style.setProperty('--cursor-y', `${y}px`);
      });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      ambientRef.current?.style.removeProperty('--cursor-x');
      ambientRef.current?.style.removeProperty('--cursor-y');
    };
  }, [location.pathname, activeView]);

  useEffect(() => {
    if (!menuOpen && !paletteOpen) return;
    const previous = document.body.style.overflow;
    const previouslyFocused = overlayTrigger.current;
    const overlay = menuOpen ? sidebarRef.current : paletteRef.current;
    document.body.style.overflow = 'hidden';
    const focusable = () =>
      Array.from(
        overlay?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled])',
        ) || [],
      );
    (menuOpen ? focusable()[0] : paletteInputRef.current)?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        setPaletteOpen(false);
      }
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
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [menuOpen, paletteOpen]);

  const words = paletteQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const paletteItems = tools
    .filter((tool) => {
      const searchable =
        `${tool.name} ${tool.description} ${tool.keywords.join(' ')}`.toLowerCase();
      return words.every((word) => searchable.includes(word));
    })
    .slice(0, 10);

  const openCommandPalette = () => {
    overlayTrigger.current = document.activeElement as HTMLElement | null;
    setPaletteQuery('');
    setPaletteIndex(0);
    setPaletteOpen(true);
  };

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !menuOpen &&
        !paletteOpen &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [menuOpen, paletteOpen]);

  return (
    <div className="site-shell porcelain-gallery-shell">
      <div className="ambient-canvas" ref={ambientRef} aria-hidden="true" />
      <a href="#main-content" className="skip-link">
        跳转到主要内容
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}
      {paletteOpen && (
        <div
          className="command-palette-backdrop"
          ref={paletteRef}
          role="dialog"
          aria-modal="true"
          aria-label="快速搜索工具"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <div className="command-palette-modal">
            <div className="command-palette-header">
              <Search size={18} />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setPaletteIndex((i) => Math.min(i + 1, Math.max(0, paletteItems.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setPaletteIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter' && paletteItems[paletteIndex]) {
                    e.preventDefault();
                    navigate(`/tool/${paletteItems[paletteIndex].id}`);
                    setPaletteOpen(false);
                  }
                }}
                placeholder="搜索工具名称或格式"
                aria-label="快速搜索"
              />
              <button
                type="button"
                className="command-close-pill"
                aria-label="关闭搜索"
                onClick={() => setPaletteOpen(false)}
              >
                ESC
              </button>
            </div>
            <div className="command-palette-list">
              {paletteItems.map((tool, idx) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`command-palette-item ${idx === paletteIndex ? 'is-selected' : ''}`}
                    onMouseEnter={() => setPaletteIndex(idx)}
                    onClick={() => {
                      navigate(`/tool/${tool.id}`);
                      setPaletteOpen(false);
                    }}
                  >
                    <span className="command-item-icon">
                      <Icon size={17} />
                    </span>
                    <span className="command-item-copy">
                      <strong>{tool.name}</strong>
                      <small>{tool.description}</small>
                    </span>
                    <span className="command-item-enter">
                      打开 <CornerDownLeft size={12} />
                    </span>
                  </button>
                );
              })}
              {paletteItems.length === 0 && (
                <div className="command-palette-empty">
                  没有找到相关工具，试试「图片」或「PDF」。
                </div>
              )}
            </div>
            <div className="command-palette-footer" aria-hidden="true">
              <span>↑↓ 选择</span>
              <span>↵ 打开</span>
              <span>Esc 关闭</span>
            </div>
          </div>
        </div>
      )}

      {/* Off-canvas Index Drawer (preserved for full accessibility & mobile/drawer navigation) */}
      <aside
        id="site-sidebar"
        ref={sidebarRef}
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
        inert={!menuOpen}
        aria-hidden={!menuOpen}
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
          <NavLink className="nav-item" to="/reminders">
            <CalendarClock size={18} />
            <span>纪念日提醒</span>
          </NavLink>
          <div className="nav-section-label">工具分类</div>
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
          <div className="nav-section-label">轻匣社区</div>
          <NavLink className="nav-item" to="/wall">
            <MessagesSquare size={18} />
            <span>留言墙</span>
          </NavLink>
          <NavLink className="nav-item" to="/gifs">
            <ImagePlay size={18} />
            <span>GIF 表情包</span>
          </NavLink>
          <NavLink className="nav-item" to="/admin">
            <ShieldCheck size={18} />
            <span>站长工作台</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <Link to="/privacy" className="privacy-card">
            <span className="privacy-symbol">
              <ShieldCheck size={20} />
            </span>
            <strong>安心，是默认选项</strong>
            <span>本地优先 · 不收集文件内容</span>
            <ArrowUpRight size={16} className="privacy-arrow" />
          </Link>
          <div className="sidebar-links">
            <NavLink to="/about">关于轻匣</NavLink>
            <span>·</span>
            <NavLink to="/privacy">隐私说明</NavLink>
          </div>
        </div>
      </aside>

      <div className="main-area" inert={menuOpen || paletteOpen}>
        {/* Scheme C: Minimalist 3-Column Spatial Gallery Header */}
        <header className="topbar gallery-topbar">
          <div className="topbar-start gallery-nav-left">
            <button
              className="icon-button mobile-menu"
              aria-label="打开导航"
              aria-expanded={menuOpen}
              aria-controls="site-sidebar"
              onClick={(event) => {
                overlayTrigger.current = event.currentTarget;
                setMenuOpen(true);
              }}
            >
              <Menu size={19} />
            </button>
            <nav className="gallery-editorial-links" aria-label="快捷导航">
              <Link to="/" className={location.pathname === '/' && !activeView ? 'is-current' : ''}>
                首页
              </Link>
              <Link to="/#tool-collection">
                工具箱 <em>{tools.length}</em>
              </Link>
              <NavLink to="/wall" className={({ isActive }) => (isActive ? 'is-current' : '')}>
                留言墙
              </NavLink>
              <NavLink to="/reminders" className={({ isActive }) => (isActive ? 'is-current' : '')}>
                纪念日提醒
              </NavLink>
            </nav>
          </div>

          <div className="gallery-brand-center">
            <Brand />
            <span className="gallery-page-indicator">{pageName}</span>
          </div>

          <div className="topbar-actions gallery-nav-right">
            <button className="topbar-search" onClick={openCommandPalette} aria-label="搜索工具">
              <Search size={14} />
              <span>搜索</span>
              <kbd>Ctrl K</kbd>
            </button>
            <Link
              to="/account"
              className="account-nav-link"
              aria-label={session ? '我的账号' : '登录或注册'}
            >
              <UserRound size={15} />
              <span>{session ? '我的账号' : '登录 / 注册'}</span>
            </Link>
            <button
              className="icon-button theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link to="/about" className="gallery-about-badge" aria-label="关于轻匣">
              <Box size={14} aria-hidden="true" />
              <span>
                <small>QINGXIA</small>
                <strong>关于轻匣</strong>
              </span>
            </Link>
          </div>
        </header>

        <main id="main-content" className="page-content" tabIndex={-1} ref={contentRef}>
          {children}
        </main>

        {/* Scheme C Signature: Bottom Floating Porcelain & Water-Droplet Spatial Dock */}
        <nav className="porcelain-spatial-dock" aria-label="常用入口">
          <Link
            to="/"
            className={`dock-pebble ${location.pathname === '/' && !activeView ? 'is-active' : ''}`}
            title="轻匣首页"
          >
            <span className="pebble-orb pebble-orb-pearl">
              <Compass size={17} />
            </span>
            <span className="pebble-label">首页</span>
          </Link>
          <Link to="/#tool-collection" className="dock-pebble" title="浏览全部工具">
            <span className="pebble-orb pebble-orb-droplet">
              <Layers size={17} />
            </span>
            <span className="pebble-label">工具箱</span>
          </Link>
          <Link
            to="/?view=favorites"
            className={`dock-pebble ${activeView === 'favorites' ? 'is-active' : ''}`}
            aria-label="我的收藏"
          >
            <span className="pebble-orb pebble-orb-rose">
              <Heart size={16} />
            </span>
            <span className="pebble-label">收藏</span>
          </Link>
          <Link
            to="/reminders"
            className={`dock-pebble ${location.pathname === '/reminders' ? 'is-active' : ''}`}
            aria-label="纪念日提醒"
          >
            <span className="pebble-orb pebble-orb-amber">
              <CalendarClock size={17} />
            </span>
            <span className="pebble-label">提醒</span>
          </Link>
          <Link
            to="/wall"
            className={`dock-pebble ${location.pathname === '/wall' || location.pathname === '/gifs' ? 'is-active' : ''}`}
            title="留言墙"
          >
            <span className="pebble-orb pebble-orb-celadon">
              <MessagesSquare size={16} />
            </span>
            <span className="pebble-label">留言</span>
          </Link>
          <span className="dock-divider" aria-hidden="true" />
          <Link
            to="/account"
            className={`dock-pebble dock-secondary ${location.pathname === '/account' ? 'is-active' : ''}`}
            title="我的账号"
          >
            <span className="pebble-orb pebble-orb-iridescent">
              <UserRound size={16} />
            </span>
            <span className="pebble-label">账号</span>
          </Link>
          <Link
            to="/admin"
            className={`dock-pebble dock-secondary ${location.pathname.startsWith('/admin') ? 'is-active' : ''}`}
            title="站长工作台"
          >
            <span className="pebble-orb pebble-orb-glass">
              <ShieldCheck size={16} />
            </span>
            <span className="pebble-label">后台</span>
          </Link>
        </nav>

        <footer className="site-footer gallery-footer">
          <span>
            <Box size={14} />
            轻匣 QINGXIA <span className="footer-divider">/</span> 为每一个日常，留一点轻松。
          </span>
          <span>
            <Check size={13} />
            免费使用<span className="footer-dot">·</span>无广告<span className="footer-dot">·</span>
            <Link to="/privacy">隐私说明</Link>
            <span className="footer-dot">·</span>
            <Link to="/wall">留言与建议</Link>
            <Sparkles size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}
