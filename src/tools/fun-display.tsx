import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Copy, Maximize, Minimize, Pause, Play, Search, Star, Trash2 } from 'lucide-react';
import { ActionButton, ErrorNotice, Field, Notice, useToolTask } from '../components/ToolUI';
import { copyText } from '../lib/files';
import {
  kaomojiCategories,
  kaomojiStorageKey,
  parseKaomojiFavorites,
  searchKaomoji,
} from '../lib/fun-display';
import './fun-display.css';

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}
type ScreenLock = {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};

export function BulletScreenTool() {
  const task = useToolTask('bullet-screen');
  const stage = useRef<HTMLDivElement>(null);
  const message = useRef<HTMLDivElement>(null);
  const wake = useRef<ScreenLock | null>(null);
  const [text, setText] = useState('今天也要闪闪发光');
  const [vertical, setVertical] = useState(false);
  const [direction, setDirection] = useState('left');
  const [size, setSize] = useState(80);
  const [duration, setDuration] = useState(10);
  const [foreground, setForeground] = useState('#b9f97d');
  const [background, setBackground] = useState('#0c1211');
  const [outline, setOutline] = useState(false);
  const [flash, setFlash] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [wakeStatus, setWakeStatus] = useState('idle');
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = stage.current;
    const update = () => setFullscreen(document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  useEffect(() => {
    const el = stage.current,
      content = message.current;
    if (!el || !content) return;
    const measure = () => {
      el.style.setProperty('--bullet-stage-w', `${el.clientWidth}px`);
      el.style.setProperty('--bullet-stage-h', `${el.clientHeight}px`);
      el.style.setProperty('--bullet-text-w', `${content.offsetWidth}px`);
      el.style.setProperty('--bullet-text-h', `${content.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text, vertical, size, started, fullscreen]);
  useEffect(() => {
    let disposed = false;
    let acquiring = false;
    if (!fullscreen || !keepAwake) {
      setWakeStatus('idle');
      return;
    }
    const api = (
      navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<ScreenLock> } }
    ).wakeLock;
    if (!api) {
      setWakeStatus('unsupported');
      return;
    }
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || wake.current || acquiring) return;
      acquiring = true;
      try {
        const lock = await api.request('screen');
        if (disposed || document.fullscreenElement !== stage.current) {
          await lock.release();
          return;
        }
        wake.current = lock;
        setWakeStatus('active');
        lock.addEventListener('release', () => {
          if (wake.current === lock) wake.current = null;
          if (!disposed) setWakeStatus('released');
        });
      } catch {
        if (!disposed) setWakeStatus('denied');
      } finally {
        acquiring = false;
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      const lock = wake.current;
      wake.current = null;
      if (lock) void lock.release().catch(() => {});
    };
  }, [fullscreen, keepAwake]);
  const start = () =>
    void task.run(() => {
      if (!text.trim()) throw new Error('请先填写弹幕文字。');
      setStarted(true);
      setPlaying(true);
    });
  const enterFullscreen = () =>
    void task.run(async () => {
      if (!text.trim()) throw new Error('请先填写弹幕文字。');
      if (!stage.current?.requestFullscreen || !document.fullscreenEnabled)
        throw new Error('此浏览器暂不支持全屏，可以继续使用页面预览。');
      try {
        await stage.current.requestFullscreen();
      } catch {
        throw new Error('浏览器未允许全屏，请继续使用预览，或在浏览器菜单中放大页面。');
      }
      if (document.fullscreenElement !== stage.current)
        throw new Error('暂未进入全屏，请再试一次。');
      setStarted(true);
      setPlaying(true);
    });
  const motion = started && !reduced ? direction : 'still';
  const style = {
    background,
    color: foreground,
    '--bullet-duration': `${duration}s`,
  } as CSSProperties;
  return (
    <div className="display-tool">
      <div className="bullet-settings">
        <Field label="弹幕文字" hint={`${text.length}/500 字符 · 内容只在当前页面使用`}>
          <textarea
            value={text}
            maxLength={500}
            rows={3}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <div className="display-settings-grid">
          <Field label="文字方向">
            <select
              value={vertical ? 'vertical' : 'horizontal'}
              onChange={(e) => setVertical(e.target.value === 'vertical')}
            >
              <option value="horizontal">横排</option>
              <option value="vertical">竖排</option>
            </select>
          </Field>
          <Field label="滚动方向">
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="left">向左滚动</option>
              <option value="right">向右滚动</option>
              <option value="up">向上滚动</option>
              <option value="down">向下滚动</option>
              <option value="still">静止展示</option>
            </select>
          </Field>
          <Field label={`字号：${size}px`}>
            <input
              type="range"
              aria-label="字号"
              min={32}
              max={240}
              step={4}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </Field>
          <Field label={`滚动用时：${duration} 秒`} hint="用时越短，滚动越快">
            <input
              type="range"
              aria-label="滚动用时"
              min={2}
              max={30}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </Field>
          <Field label="文字颜色">
            <input
              type="color"
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
            />
          </Field>
          <Field label="背景颜色">
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </Field>
        </div>
        <div className="display-toggles">
          <label>
            <input
              type="checkbox"
              checked={outline}
              onChange={(e) => setOutline(e.target.checked)}
            />
            文字描边
          </label>
          <label>
            <input type="checkbox" checked={flash} onChange={(e) => setFlash(e.target.checked)} />
            闪烁（默认关闭）
          </label>
          <label>
            <input
              type="checkbox"
              checked={keepAwake}
              onChange={(e) => setKeepAwake(e.target.checked)}
            />
            全屏时尝试保持常亮
          </label>
        </div>
        <div className="tool-actions">
          <ActionButton busy={task.busy} onClick={playing ? () => setPlaying(false) : start}>
            {playing ? <Pause size={16} /> : <Play size={16} />}{' '}
            {playing ? '暂停播放' : started ? '继续播放' : '开始播放'}
          </ActionButton>
          <button
            className="button button-secondary"
            onClick={enterFullscreen}
            disabled={task.busy}
          >
            <Maximize size={16} />
            进入全屏
          </button>
        </div>
        <ErrorNotice error={task.error} />
        {reduced && <Notice>系统已开启减少动态效果，弹幕以静止方式展示，闪烁已关闭。</Notice>}
        <Notice>
          手机使用时可手动横屏。全屏后按 Esc
          或点击退出；常亮取决于浏览器权限，退出全屏或离开页面会释放。
        </Notice>
        <div className="wake-status" role="status">
          {wakeStatus === 'active'
            ? '已获得屏幕常亮权限'
            : wakeStatus === 'unsupported'
              ? '此浏览器不支持屏幕常亮，请自行调整设备自动锁屏设置。'
              : wakeStatus === 'denied'
                ? '暂未获得常亮权限，弹幕仍可正常展示。'
                : wakeStatus === 'released'
                  ? '屏幕常亮已释放；回到可见页面时将按当前设置尝试恢复。'
                  : keepAwake
                    ? '进入全屏后尝试申请常亮权限。'
                    : '未申请屏幕常亮权限。'}
        </div>
      </div>
      <section aria-label="弹幕预览" className="bullet-stage" ref={stage} style={style}>
        <div
          ref={message}
          className={`bullet-message direction-${motion}`}
          style={{
            fontSize: size,
            writingMode: vertical ? 'vertical-rl' : 'horizontal-tb',
            animationPlayState: playing ? 'running' : 'paused',
          }}
        >
          <span
            className={flash && !reduced ? 'bullet-flash' : ''}
            style={{
              WebkitTextStroke: outline ? '2px #000' : '0px',
              paintOrder: 'stroke fill',
              animationPlayState: playing ? 'running' : 'paused',
            }}
          >
            {text || '填写文字开始展示'}
          </span>
        </div>
        {fullscreen && (
          <button
            className="bullet-exit"
            onClick={() =>
              void document.exitFullscreen().catch(() => task.setError('退出全屏失败，请按 Esc。'))
            }
          >
            <Minimize size={18} />
            退出全屏
          </button>
        )}
      </section>
    </div>
  );
}

export function KaomojiTool() {
  const task = useToolTask('kaomoji');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return parseKaomojiFavorites(localStorage.getItem(kaomojiStorageKey));
    } catch {
      return [];
    }
  });
  const [storageWarning, setStorageWarning] = useState('');
  const [copied, setCopied] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const update = (e: StorageEvent) => {
      if (e.key === kaomojiStorageKey || e.key === null) {
        try {
          setFavorites(parseKaomojiFavorites(localStorage.getItem(kaomojiStorageKey)));
        } catch {
          setFavorites([]);
        }
      }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  const save = (next: string[]) => {
    setFavorites(next);
    try {
      localStorage.setItem(kaomojiStorageKey, JSON.stringify(next));
      setStorageWarning('');
    } catch {
      setStorageWarning('浏览器不允许保存，收藏仅在当前页面内保留。');
    }
  };
  const visible = searchKaomoji(query, category, onlyFavorites ? favorites : undefined);
  return (
    <div className="kaomoji-tool">
      <div className="kaomoji-toolbar">
        <Field label="搜索颜文字">
          <div className="kaomoji-search">
            <Search size={17} />
            <input
              value={query}
              maxLength={80}
              placeholder="试试开心、抱抱、加油…"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </Field>
        <button
          className={`button button-secondary ${onlyFavorites ? 'is-active' : ''}`}
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
        >
          <Star size={16} />
          我的颜文字收藏（{favorites.length}）
        </button>
        {favorites.length > 0 && (
          <button className="button button-ghost" onClick={() => save([])}>
            <Trash2 size={15} />
            清空颜文字收藏
          </button>
        )}
      </div>
      <div className="kaomoji-categories" aria-label="颜文字分类">
        {['全部', ...kaomojiCategories].map((name) => (
          <button
            key={name}
            aria-pressed={category === name}
            className={category === name ? 'active' : ''}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="display-help">
        {visible.length} 个颜文字 · 点击复制。收藏只保存在当前浏览器，搜索词不会上传。
      </p>
      <ErrorNotice error={task.error} />
      {storageWarning && <Notice tone="warning">{storageWarning}</Notice>}
      <div className="kaomoji-grid">
        {visible.map((item) => (
          <article className="kaomoji-item" key={item.id}>
            <p className="kaomoji-face">{item.value}</p>
            <div className="kaomoji-item-footer">
              <span>{item.label}</span>
              <div>
                <button
                  className="icon-button"
                  title={favorites.includes(item.id) ? '取消收藏' : '收藏'}
                  aria-pressed={favorites.includes(item.id)}
                  aria-label={`${favorites.includes(item.id) ? '取消收藏' : '收藏'}${item.label}`}
                  onClick={() =>
                    save(
                      favorites.includes(item.id)
                        ? favorites.filter((id) => id !== item.id)
                        : [...favorites, item.id],
                    )
                  }
                >
                  <Star size={17} fill={favorites.includes(item.id) ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-button"
                  disabled={task.busy}
                  aria-label={`复制${item.label}`}
                  onClick={() =>
                    void task.run(async () => {
                      await copyText(item.value);
                      setCopied(item.id);
                      window.clearTimeout(timer.current);
                      timer.current = window.setTimeout(() => setCopied(''), 1800);
                    })
                  }
                >
                  {copied === item.id ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
            </div>
            {copied === item.id && (
              <span role="status" className="kaomoji-copied">
                已复制到剪贴板
              </span>
            )}
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="kaomoji-empty">
          {onlyFavorites
            ? '这里还没有符合条件的收藏，试试切回全部或清除搜索。'
            : '没有找到这个颜文字，试试换个关键词或分类。'}
        </div>
      )}
    </div>
  );
}
