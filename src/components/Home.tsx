import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Heart,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { categories, tools, type ToolMeta } from '../lib/registry';
import { useFavorites, useRecentTools } from '../lib/preferences';

const BreathingBox = lazy(() => import('./BreathingBox'));

function ToolCard({
  tool,
  index,
  onFavorite,
}: {
  tool: ToolMeta;
  index: number;
  onFavorite: (message: string) => void;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const Icon = tool.icon;
  return (
    <article
      className={`tool-card category-${tool.category} ${isFavorite(tool.id) ? 'is-saved' : ''}`}
      style={{ '--card-index': Math.min(index, 12) } as React.CSSProperties}
    >
      <Link to={`/tool/${tool.id}`} className="tool-card-link">
        <div className="tool-card-head">
          <span className="tool-icon">
            <Icon size={22} strokeWidth={1.7} />
          </span>
          <span className={`tool-mode ${tool.mode === 'link' ? 'tool-mode-link' : ''}`}>
            {tool.mode === 'link' ? (
              <>
                <ArrowUpRight size={10} />
                链接解析
              </>
            ) : (
              <>
                <span />
                本地处理
              </>
            )}
          </span>
        </div>
        <h3>{tool.name}</h3>
        <p>{tool.description}</p>
        <div className="tool-card-bottom">
          <span>
            {categories.find((category) => category.id === tool.category)?.label || '实用工具'}
          </span>
          <span className="card-open">
            开始使用
            <ArrowUpRight size={14} />
          </span>
        </div>
      </Link>
      <button
        className={`favorite-button ${isFavorite(tool.id) ? 'is-favorite' : ''}`}
        onClick={() => {
          onFavorite(isFavorite(tool.id) ? `已取消收藏${tool.name}` : `已收藏${tool.name}`);
          toggleFavorite(tool.id);
        }}
        aria-label={isFavorite(tool.id) ? `取消收藏${tool.name}` : `收藏${tool.name}`}
        aria-pressed={isFavorite(tool.id)}
      >
        <Heart size={16} fill={isFavorite(tool.id) ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

export default function Home() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || 'all';
  const view = params.get('view') || 'all';
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');
  const [feedback, setFeedback] = useState('');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const announceFavorite = (message: string) => {
    clearTimeout(feedbackTimer.current);
    setFeedback(message);
    feedbackTimer.current = setTimeout(() => setFeedback(''), 1800);
  };
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  const searchRef = useRef<HTMLInputElement>(null);
  const { favorites } = useFavorites();
  const { recent, clearRecent } = useRecentTools();
  const isSpecialView = view === 'favorites' || view === 'recent';
  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (
        (event.key === '/' && !editing) ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        focus();
      }
      if (event.key === 'Escape') searchRef.current?.blur();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('qingxia:focus-search', focus);
    if (params.get('search')) focus();
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('qingxia:focus-search', focus);
    };
  }, [params]);
  const availableCategories = categories.filter((item) =>
    tools.some((tool) => tool.category === item.id),
  );
  const filtered = useMemo(() => {
    const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let list = tools.filter(
      (tool) =>
        (category === 'all' || tool.category === category) &&
        (view !== 'favorites' || favorites.includes(tool.id)) &&
        (view !== 'recent' || recent.includes(tool.id)) &&
        words.every((word) =>
          `${tool.name} ${tool.description} ${tool.keywords.join(' ')}`
            .toLocaleLowerCase()
            .includes(word),
        ),
    );
    if (view === 'recent')
      list = [...list].sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    if (sort === 'default' && view !== 'recent')
      list = [...list].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return list;
  }, [category, favorites, recent, search, sort, view]);
  const setCategory = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('category');
    else next.set('category', id);
    next.delete('search');
    setParams(next);
  };
  const selectedLabel = categories.find((item) => item.id === category)?.label;
  const revealTools = () =>
    document.getElementById('tool-collection')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = gridRef.current?.animate(
      [
        { opacity: 0.72, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return () => animation?.cancel();
  }, [category, view, sort]);
  const searchBox = (
    <div className="search-container">
      <Search size={20} />
      <input
        ref={searchRef}
        aria-label="搜索工具"
        onKeyDown={(event) => {
          if (event.key === 'Enter') revealTools();
        }}
        placeholder="想做点什么？搜索工具、功能或关键词…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {search ? (
        <button className="icon-button" aria-label="清空搜索" onClick={() => setSearch('')}>
          <X size={16} />
        </button>
      ) : (
        <kbd>/</kbd>
      )}
    </div>
  );
  return (
    <div className="home-page">
      {!isSpecialView && (
        <section className="hero-section">
          <div className="hero-copy">
            <h1>
              把日常小事，
              <br />
              <span>轻轻解决。</span>
            </h1>
            <p className="hero-description">
              给文件一个去处，给灵感一点空间。
              <br />
              在你的浏览器里，把繁琐变轻巧。
            </p>
            {searchBox}
            <div className="hero-features">
              <span>
                <Check size={13} />
                完全免费
              </span>
              <span>
                <Check size={13} />
                无需登录
              </span>
              <span>
                <Check size={13} />
                隐私优先
              </span>
            </div>
            <button className="hero-explore" onClick={revealTools}>
              探索你的工具箱 <ArrowDown size={15} />
            </button>
          </div>
          <div className="scene-slot">
            <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
              <BreathingBox />
            </Suspense>
            <div className="scene-caption" aria-hidden="true">
              <span>为琐事留白</span>
              <span>为灵感留光</span>
            </div>
          </div>
        </section>
      )}
      {isSpecialView && (
        <section className="collection-hero">
          <div className="collection-hero-icon">
            {view === 'favorites' ? <Heart size={28} /> : <History size={28} />}
          </div>
          <div>
            <h1>{view === 'favorites' ? '随手收藏，随时好用。' : '上次的顺手，这次继续。'}</h1>
            <p>
              {view === 'favorites'
                ? '把常用工具留在这里，下次少找一步。'
                : '最近打开的工具，已经为你整理好了。'}
              记录仅保存在当前浏览器。
            </p>
          </div>
        </section>
      )}
      <section className="tool-collection" id="tool-collection" aria-label="工具列表">
        <div className="collection-topline">
          <div className="collection-heading">
            <h2>
              {view === 'favorites'
                ? '我的收藏'
                : view === 'recent'
                  ? '最近使用'
                  : selectedLabel || '发现好用的工具'}
              <span>{filtered.length.toString().padStart(2, '0')}</span>
            </h2>
          </div>
          <div className="collection-subtitle">
            <span className="mini-dot" />
            少一点繁琐，多一点专注
          </div>
        </div>
        {isSpecialView && searchBox}
        <div className="collection-controls">
          <div className="category-tabs" role="group" aria-label="按分类筛选">
            <button
              className={category === 'all' ? 'selected' : ''}
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              <Box size={14} />
              全部工具<span>{tools.length}</span>
            </button>
            {availableCategories.map((item) => (
              <button
                key={item.id}
                className={category === item.id ? 'selected' : ''}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <span className="sr-only">排序方式</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="default">默认排序</option>
              <option value="name">名称排序</option>
            </select>
          </label>
        </div>
        {view === 'recent' && recent.length > 0 && (
          <div className="collection-local-note">
            <span>
              <LockKeyhole size={13} />
              仅存于此浏览器
            </span>
            <button className="text-button" onClick={clearRecent}>
              清空最近使用
            </button>
          </div>
        )}
        {filtered.length > 0 ? (
          <div className="tool-grid" ref={gridRef}>
            {filtered.map((tool, index) => (
              <ToolCard tool={tool} key={tool.id} index={index} onFavorite={announceFavorite} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              {view === 'favorites' ? <Heart size={30} /> : <Search size={30} />}
            </span>
            <h3>
              {search
                ? '暂时没有找到这个工具'
                : view === 'favorites'
                  ? '给喜欢的工具，留一颗心'
                  : view === 'recent'
                    ? '你的第一次使用，就从这里开始'
                    : '这个分类还没有工具'}
            </h3>
            <p>
              {search
                ? '试试更短的关键词，例如「图片」「PDF」或「转换」。'
                : view === 'favorites'
                  ? '点击工具卡片上的爱心，就能在这里快速找到它。'
                  : '轻巧的工具，等你探索。'}
            </p>
            {isSpecialView && (
              <Link className="button button-secondary" to="/">
                发现全部工具
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        )}
      </section>
      <section className="home-privacy-banner">
        <span className="privacy-banner-icon">
          <ShieldCheck size={25} />
        </span>
        <div>
          <h3>你的文件，只属于你。</h3>
          <p>本地工具在浏览器内完成处理。文件不上传，隐私不打折。</p>
        </div>
        <Link to="/privacy">
          了解隐私承诺
          <ArrowUpRight size={15} />
        </Link>
        <div className="banner-decoration" aria-hidden="true">
          <LockKeyhole size={74} />
        </div>
      </section>
      <div className="favorite-feedback" role="status" aria-live="polite">
        {feedback}
      </div>
      <div className="home-endnote">
        <Sparkles size={13} />
        <span>不追求面面俱到，只想让每一次使用都恰到好处。</span>
      </div>
    </div>
  );
}
