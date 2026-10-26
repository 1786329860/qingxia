import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Heart,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { categories, tools, type ToolMeta } from '../lib/registry';
import { useFavorites, useRecentTools } from '../lib/preferences';

function CubeArt() {
  return (
    <div className="cube-art" aria-hidden="true">
      <div className="orbital orbital-one" />
      <div className="orbital orbital-two" />
      <div className="cube-glow" />
      <div className="cube-grid" />
      <svg viewBox="0 0 380 330" className="hero-cube">
        <defs>
          <linearGradient id="cube-top" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ddffac" stopOpacity=".8" />
            <stop offset="1" stopColor="#82d36b" stopOpacity=".1" />
          </linearGradient>
          <linearGradient id="cube-left" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#a9f37e" stopOpacity=".3" />
            <stop offset="1" stopColor="#2e6551" stopOpacity=".05" />
          </linearGradient>
          <linearGradient id="cube-right" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#c7ff99" stopOpacity=".4" />
            <stop offset="1" stopColor="#4ba16f" stopOpacity=".12" />
          </linearGradient>
          <filter id="cube-blur">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        <ellipse
          cx="193"
          cy="285"
          rx="95"
          ry="16"
          fill="#b9f97d"
          opacity=".15"
          filter="url(#cube-blur)"
        />
        <g className="cube-body">
          <path
            d="m92 113 100-54 100 54-100 56z"
            fill="url(#cube-top)"
            stroke="#c7ff9c"
            strokeOpacity=".65"
          />
          <path
            d="m92 113 100 56v111L92 225z"
            fill="url(#cube-left)"
            stroke="#b1ef8e"
            strokeOpacity=".35"
          />
          <path
            d="m192 169 100-56v112l-100 55z"
            fill="url(#cube-right)"
            stroke="#caffaa"
            strokeOpacity=".6"
          />
          <ellipse
            cx="192"
            cy="178"
            rx="37"
            ry="39"
            fill="#b9f97d"
            opacity=".35"
            filter="url(#cube-blur)"
          />
          <path
            d="m152 155 40-22 40 22-40 22z"
            fill="#c8ff91"
            fillOpacity=".24"
            stroke="#d9ffb7"
            strokeOpacity=".55"
          />
          <path
            d="m152 155 40 22v45l-40-23z"
            fill="#b9f97d"
            fillOpacity=".13"
            stroke="#c7ff99"
            strokeOpacity=".35"
          />
          <path
            d="m192 177 40-22v44l-40 23z"
            fill="#b9f97d"
            fillOpacity=".3"
            stroke="#e2ffc3"
            strokeOpacity=".7"
          />
          <path
            d="m106 106 86-46 87 46M292 114v111l-100 55"
            fill="none"
            stroke="#ecffda"
            strokeOpacity=".8"
            strokeWidth="1.3"
          />
          <path
            d="m125 132 67 37 67-37M192 169v75"
            fill="none"
            stroke="#e2ffcb"
            strokeOpacity=".5"
            strokeWidth="1.5"
          />
          <path
            d="m145 100 47-25 47 25-47 26z"
            fill="#c5ff9a"
            fillOpacity=".5"
            stroke="#e6ffd6"
            strokeOpacity=".6"
          />
          <path d="m153 105 39 21 39-21" fill="none" stroke="#f1ffe7" strokeOpacity=".75" />
          <path
            d="m170 94 22 12 22-12"
            fill="none"
            stroke="#edffe1"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m112 150 19 10m-19 9 19 10m-19 9 19 10"
            stroke="#d8ffbc"
            strokeOpacity=".5"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="268" cy="207" r="3" fill="#c4ff94" />
          <circle cx="268" cy="219" r="3" fill="#c4ff94" fillOpacity=".35" />
        </g>
        <g className="cube-sparkles" fill="#d9ffb7">
          <path d="m296 58 3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
          <path d="m72 212 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
          <circle cx="92" cy="65" r="2" />
          <circle cx="318" cy="183" r="2" />
          <circle cx="130" cy="264" r="1.5" />
        </g>
      </svg>
      <span className="floating-pill pill-top">
        <ShieldCheck size={13} />
        本地优先
      </span>
      <span className="floating-pill pill-bottom">
        <Zap size={13} />
        即开即用
      </span>
      <span className="cube-coordinate">少一点繁琐，多一点自在</span>
    </div>
  );
}

function ToolCard({ tool, index }: { tool: ToolMeta; index: number }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const Icon = tool.icon;
  return (
    <article
      className={`tool-card category-${tool.category}`}
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
        onClick={() => toggleFavorite(tool.id)}
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
  return (
    <div className="home-page">
      {!isSpecialView && (
        <section className="hero-section">
          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span className="live-dot" />
              <span>小工具，大自在</span>
              <span className="eyebrow-line" />
              <span className="hero-eyebrow-en">随手可用的日常工具</span>
            </div>
            <h1>
              把日常小事，
              <br />
              <span>轻轻解决。</span>
              <span className="hero-period">✳</span>
            </h1>
            <p className="hero-description">
              不必在无数个网站之间来回。
              <br className="mobile-break" /> 你的图片、文件与灵感，
              <br className="desktop-break" />
              都能在这里找到一个轻巧的解决方式。
            </p>
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
            <button
              className="hero-explore"
              onClick={() =>
                document
                  .getElementById('tool-collection')
                  ?.scrollIntoView({
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'auto'
                      : 'smooth',
                    block: 'start',
                  })
              }
            >
              探索你的工具箱 <ArrowDown size={15} />
            </button>
          </div>
          <CubeArt />
        </section>
      )}
      {isSpecialView && (
        <section className="collection-hero">
          <div className="collection-hero-icon">
            {view === 'favorites' ? <Heart size={28} /> : <History size={28} />}
          </div>
          <div>
            <div className="section-eyebrow">只属于你的常用角落</div>
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
            <span className="section-kicker">轻巧，且刚刚好</span>
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
        <div className="search-container">
          <Search size={20} />
          <input
            ref={searchRef}
            aria-label="搜索工具"
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
        <div className="collection-controls">
          <div className="category-tabs" role="group" aria-label="按分类筛选">
            <button
              className={category === 'all' ? 'selected' : ''}
              onClick={() => setCategory('all')}
            >
              <Box size={14} />
              全部工具<span>{tools.length}</span>
            </button>
            {availableCategories.map((item) => (
              <button
                key={item.id}
                className={category === item.id ? 'selected' : ''}
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
          <div className="tool-grid">
            {filtered.map((tool, index) => (
              <ToolCard tool={tool} key={tool.id} index={index} />
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
      <div className="home-endnote">
        <Sparkles size={13} />
        <span>不追求面面俱到，只想让每一次使用都恰到好处。</span>
      </div>
    </div>
  );
}
