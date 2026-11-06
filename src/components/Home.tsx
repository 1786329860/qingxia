import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
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

const GALLERY_SUITES = [
  { num: '01.', en: 'IMAGE', zh: '图片工具', cat: 'image' },
  { num: '02.', en: 'DOCUMENT', zh: 'PDF 工具', cat: 'pdf' },
  { num: '03.', en: 'TEXT', zh: '文本编码', cat: 'text' },
  { num: '04.', en: 'MEDIA', zh: '视频音频', cat: 'media' },
  { num: '05.', en: 'DEVELOPER', zh: '开发工具', cat: 'dev' },
];

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
  const cardRef = useRef<HTMLElement>(null);
  const Icon = tool.icon;
  const serial = (index + 1).toString().padStart(2, '0');

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const node = cardRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -2.4;
    const ry = ((x - rect.width / 2) / (rect.width / 2)) * 2.4;
    node.style.setProperty('--spot-x', `${x.toFixed(1)}px`);
    node.style.setProperty('--spot-y', `${y.toFixed(1)}px`);
    node.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`);
    node.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    const node = cardRef.current;
    if (!node) return;
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
  };

  return (
    <article
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`tool-card porcelain-shard-card category-${tool.category} ${isFavorite(tool.id) ? 'is-saved' : ''} ${tool.featured ? 'is-featured' : ''}`}
      style={{ '--card-index': Math.min(index, 12) } as React.CSSProperties}
    >
      <div className="tool-card-glow" aria-hidden="true" />
      <Link to={`/tool/${tool.id}`} className="tool-card-link">
        <div className="tool-card-head">
          <span className="tool-icon">
            <Icon size={20} strokeWidth={1.6} />
          </span>
          <span className="tool-serial" aria-hidden="true">
            {serial}
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
            打开工具
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
  const { hash, key: locationKey } = useLocation();
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
      if (event.isComposing || event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      const editing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (event.key === '/' && !editing) {
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
    if (hash !== '#tool-collection') return;
    const frame = requestAnimationFrame(revealTools);
    return () => cancelAnimationFrame(frame);
  }, [hash, locationKey]);

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = gridRef.current?.animate(
      [
        { opacity: 0.72, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    );
    return () => animation?.cancel();
  }, [category, view, sort]);

  const searchBox = (
    <div className="search-container porcelain-search-bar">
      <Search size={18} />
      <input
        ref={searchRef}
        aria-label="搜索工具"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) revealTools();
        }}
        placeholder="搜索工具，如 PDF、图片压缩"
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
    <div className="home-page porcelain-home">
      {!isSpecialView && (
        <section className="hero-section spatial-gallery-stage" data-hero>
          {/* Left Floating Frosted Ceramic Tablet (Exact Scheme C Composition) */}
          <div className="hero-copy porcelain-tablet-left">
            <div className="tablet-header">
              <span>CREATIVE TOOLS</span>
              <small>常用分类</small>
            </div>
            <ul className="porcelain-suite-list" aria-label="常用工具分类">
              {GALLERY_SUITES.map((suite) => (
                <li key={suite.num}>
                  <button
                    type="button"
                    className={`suite-row ${category === suite.cat ? 'is-active' : ''}`}
                    aria-label={suite.zh}
                    aria-pressed={category === suite.cat}
                    onClick={() => {
                      setCategory(suite.cat);
                      revealTools();
                    }}
                  >
                    <span className="suite-num">{suite.num}</span>
                    <span className="suite-en">{suite.en}</span>
                    <span className="suite-zh">{suite.zh}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="porcelain-hero-headline">
              <h1>
                把日常小事，
                <br />
                <span>轻轻解决。</span>
              </h1>
              <p className="hero-description">图片、文档和影音处理，常用工具都在这里。</p>
            </div>
            {searchBox}
            <div className="tablet-footer">
              <button className="hero-explore" onClick={revealTools}>
                浏览全部工具 <ArrowDown size={14} />
              </button>
              <span className="tablet-serial">01</span>
            </div>
          </div>

          {/* Centerpiece: 3D Organic Liquid Porcelain & Water-Droplet Sculpture */}
          <div className="scene-slot porcelain-centerpiece-slot">
            <Suspense fallback={<div className="scene-loading" aria-hidden="true" />}>
              <BreathingBox />
            </Suspense>
            <div className="scene-caption" aria-hidden="true">
              <span>QINGXIA / 轻匣</span>
              <span>白瓷浮光</span>
            </div>
          </div>

          {/* Right Floating Creased Washi Paper Card (Exact Scheme C Composition) */}
          <aside className="washi-reflection-card" aria-label="关于轻匣">
            <span className="washi-folded-corner" aria-hidden="true" />
            <div className="washi-header">
              <span>轻匣便笺</span>
              <em>Notes</em>
            </div>
            <p className="washi-poem-cn">
              随手办好一件小事，
              <br />
              把时间留给更重要的事。
            </p>
            <p className="washi-note">登录后免费使用工具，也可以写张贺卡，约好时间发出。</p>
            <div className="hero-features washi-tags">
              <span>
                <Check size={12} /> 本地文件处理
              </span>
              <span>
                <Check size={12} /> 免费无广告
              </span>
            </div>
            <div className="washi-actions">
              <Link to="/reminders" className="washi-link">
                纪念日提醒 <ArrowUpRight size={13} />
              </Link>
              <Link to="/account" className="washi-link">
                轻匣账号 <ArrowUpRight size={13} />
              </Link>
            </div>
            <span className="washi-serial" aria-hidden="true">
              05
            </span>
          </aside>
        </section>
      )}
      {isSpecialView && (
        <section className="collection-hero">
          <div className="collection-hero-icon">
            {view === 'favorites' ? <Heart size={28} /> : <History size={28} />}
          </div>
          <div>
            <h1>{view === 'favorites' ? '我的收藏' : '最近使用'}</h1>
            <p>
              {view === 'favorites' ? '常用工具都收在这里。' : '从上次打开的工具继续。'}
              记录仅保存在当前浏览器。
            </p>
          </div>
        </section>
      )}
      <section className="tool-collection" id="tool-collection" aria-label="工具列表">
        <div className="collection-topline">
          <div className="collection-heading">
            <span className="section-kicker" aria-hidden="true">
              QINGXIA TOOLS
            </span>
            <h2>
              {view === 'favorites'
                ? '已收藏'
                : view === 'recent'
                  ? '使用记录'
                  : selectedLabel || '全部工具'}
              <span>{filtered.length.toString().padStart(2, '0')}</span>
            </h2>
          </div>
          <div className="collection-subtitle">
            <span className="mini-dot" />
            按分类浏览，或搜索工具名称
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
              全部<span>{tools.length}</span>
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
              <option value="name">按名称排序</option>
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
              清空最近记录
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
                ? '没有找到匹配的工具'
                : view === 'favorites'
                  ? '还没有收藏工具'
                  : view === 'recent'
                    ? '还没有使用记录'
                    : '这个分类暂无工具'}
            </h3>
            <p>
              {search
                ? '试试更短的关键词，例如「图片」「PDF」或「转换」。'
                : view === 'favorites'
                  ? '点击工具卡片上的爱心，即可收藏。'
                  : '可以切换分类，看看其他工具。'}
            </p>
            {isSpecialView && (
              <Link className="button button-secondary" to="/">
                浏览全部工具
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
          <h3>你的文件，留在自己的设备上</h3>
          <p>图片、PDF、音视频等本地工具在浏览器内处理，文件与输入内容不会上传。</p>
        </div>
        <Link to="/privacy">
          查看隐私说明
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
        <span>为每一个日常，留一点轻松。</span>
      </div>
    </div>
  );
}
