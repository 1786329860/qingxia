import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  ShieldCheck,
  Star,
  LoaderCircle,
  LockKeyhole,
  Cpu,
  CircleHelp,
} from 'lucide-react';
import SiteShell from './components/SiteShell';
import Home from './components/Home';
import { getTool, categories } from './lib/registry';
import { useFavorites, rememberTool } from './lib/preferences';
import { trackPageView } from './lib/analytics';
import { getPageSeo, updateDocumentSeo } from './lib/seo';
const Admin = lazy(() => import('./pages/Admin'));
const Privacy = lazy(() => import('./pages/Privacy'));
const About = lazy(() => import('./pages/About'));
const pages: Record<string, ReturnType<typeof lazy>> = {
  'image-compress': lazy(() =>
    import('./tools/images').then((m) => ({ default: m.ImageCompressTool })),
  ),
  'image-convert': lazy(() =>
    import('./tools/images').then((m) => ({ default: m.ImageConvertTool })),
  ),
  'pdf-merge': lazy(() => import('./tools/pdf').then((m) => ({ default: m.PdfMergeTool }))),
  'pdf-split': lazy(() => import('./tools/pdf').then((m) => ({ default: m.PdfSplitTool }))),
  'pdf-to-images': lazy(() => import('./tools/pdf').then((m) => ({ default: m.PdfToImagesTool }))),
  'images-to-pdf': lazy(() => import('./tools/pdf').then((m) => ({ default: m.ImagesToPdfTool }))),
  'pdf-compress': lazy(() => import('./tools/pdf').then((m) => ({ default: m.PdfCompressTool }))),
  'video-frames': lazy(() => import('./tools/media').then((m) => ({ default: m.VideoFramesTool }))),
  'video-gif': lazy(() => import('./tools/media').then((m) => ({ default: m.VideoGifTool }))),
  'extract-audio': lazy(() =>
    import('./tools/media').then((m) => ({ default: m.ExtractAudioTool })),
  ),
  json: lazy(() => import('./tools/text').then((m) => ({ default: m.JsonTool }))),
  base64: lazy(() => import('./tools/text').then((m) => ({ default: m.Base64Tool }))),
  'text-lines': lazy(() => import('./tools/text').then((m) => ({ default: m.TextLinesTool }))),
  'csv-json': lazy(() => import('./tools/text').then((m) => ({ default: m.CsvJsonTool }))),
  units: lazy(() => import('./tools/convert').then((m) => ({ default: m.UnitsTool }))),
  timestamp: lazy(() => import('./tools/convert').then((m) => ({ default: m.TimestampTool }))),
  radix: lazy(() => import('./tools/convert').then((m) => ({ default: m.RadixTool }))),
  qr: lazy(() => import('./tools/developer').then((m) => ({ default: m.QrTool }))),
  hash: lazy(() => import('./tools/developer').then((m) => ({ default: m.HashTool }))),
  random: lazy(() => import('./tools/developer').then((m) => ({ default: m.RandomTool }))),
  color: lazy(() => import('./tools/developer').then((m) => ({ default: m.ColorTool }))),
  douyin: lazy(() => import('./tools/douyin')),
  'draw-lots': lazy(() => import('./tools/fun-random').then((m) => ({ default: m.LotsTool }))),
  wheel: lazy(() => import('./tools/fun-random').then((m) => ({ default: m.WheelTool }))),
  coin: lazy(() => import('./tools/fun-random').then((m) => ({ default: m.CoinTool }))),
  dice: lazy(() => import('./tools/fun-random').then((m) => ({ default: m.DiceTool }))),
  'bullet-screen': lazy(() =>
    import('./tools/fun-display').then((m) => ({ default: m.BulletScreenTool })),
  ),
  kaomoji: lazy(() => import('./tools/fun-display').then((m) => ({ default: m.KaomojiTool }))),
};
function Loading() {
  return (
    <div className="page-loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>正在打开工具…</span>
    </div>
  );
}
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty-state">
        <CircleHelp size={32} />
        <h2>这个页面暂时遇到问题</h2>
        <p>请刷新重试。文件仍在你的设备中。</p>
        <button className="button button-primary" onClick={() => location.reload()}>
          重新加载
        </button>
        <Link to="/">返回首页</Link>
      </div>
    ) : (
      this.props.children
    );
  }
}
function ToolRoute() {
  const { id = '' } = useParams();
  const tool = getTool(id);
  const { isFavorite, toggleFavorite } = useFavorites();
  useEffect(() => {
    if (tool) rememberTool(tool.id);
  }, [tool?.id]);
  if (!tool || !pages[id]) return <NotFound />;
  const View = pages[id];
  const Icon = tool.icon;
  const category = categories.find((c) => c.id === tool.category);
  return (
    <>
      <div className="tool-breadcrumb">
        <Link to="/">工具箱</Link>
        <span>/</span>
        <Link to={`/?category=${tool.category}`}>{category?.label}</Link>
        <span>/</span>
        <span>{tool.name}</span>
      </div>
      <header className="tool-page-header">
        <div className={`tool-heading-icon category-${tool.category}`}>
          <Icon size={29} />
        </div>
        <div>
          <h1>{tool.name}</h1>
          <p>{tool.description}</p>
        </div>
        <button
          className={`icon-button favorite-button ${isFavorite(id) ? 'is-active' : ''}`}
          onClick={() => toggleFavorite(id)}
          aria-label={isFavorite(id) ? '取消收藏' : '收藏工具'}
        >
          <Star size={20} fill={isFavorite(id) ? 'currentColor' : 'none'} />
        </button>
      </header>
      <div className={`tool-privacy-bar ${tool.mode === 'link' ? 'is-link' : ''}`}>
        {tool.mode === 'local' ? <ShieldCheck size={17} /> : <LockKeyhole size={17} />}
        <strong>
          {tool.mode === 'local'
            ? '本地处理，文件不会离开你的浏览器'
            : '仅解析链接，不保存媒体文件'}
        </strong>
        <span>{tool.mode === 'local' ? '安心使用 · 无需登录' : '只处理你主动提交的公开链接'}</span>
      </div>
      <div className="tool-panel">
        <PageBoundary key={id}>
          <Suspense fallback={<Loading />}>
            {typeof window === 'undefined' ? (
              <p className="muted">
                {tool.mode === 'local'
                  ? '本工具在浏览器内处理，请启用 JavaScript 后使用。文件与输入正文不上传。'
                  : '请启用 JavaScript 后粘贴公开作品分享链接。实验性解析与下载受平台访问策略限制。'}
              </p>
            ) : (
              <View />
            )}
          </Suspense>
        </PageBoundary>
      </div>
      <div className="tool-bottom-note">
        <Cpu size={15} />
        <span>
          {tool.mode === 'local'
            ? '处理能力取决于设备与浏览器，建议使用最新版 Chrome、Edge、Firefox 或 Safari。'
            : '第三方平台可能调整访问限制；解析失败时请稍后再试，不会无限重试。'}
        </span>
        <Link to="/privacy">
          隐私说明
          <ArrowUpRight size={13} />
        </Link>
      </div>
    </>
  );
}
function NotFound() {
  return (
    <div className="empty-state">
      <span className="eyebrow">404 / 暂未收录</span>
      <h1>这个角落还没有工具</h1>
      <p>回到轻匣，找点有用的。</p>
      <Link className="button button-primary" to="/">
        <ArrowLeft size={16} />
        返回工具箱
      </Link>
    </div>
  );
}
function RouteEffects() {
  const { pathname, search } = useLocation();
  useEffect(() => updateDocumentSeo(getPageSeo(pathname, search)), [pathname, search]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const timer = setTimeout(() => trackPageView(pathname), 100);
    return () => clearTimeout(timer);
  }, [pathname]);
  return null;
}
export default function App() {
  return (
    <SiteShell>
      <RouteEffects />
      <PageBoundary>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tool/:id" element={<ToolRoute />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </PageBoundary>
    </SiteShell>
  );
}
