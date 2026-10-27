import { useEffect, useRef, useState } from 'react';
import { Coins, Dice5, Plus, RotateCcw, Shuffle, Trash2 } from 'lucide-react';
import {
  ActionButton,
  CopyButton,
  ErrorNotice,
  Field,
  Notice,
  ResultBox,
  useToolTask,
} from '../components/ToolUI';
import {
  chooseWeighted,
  diceSides,
  drawNames,
  flipCoins,
  parseNames,
  parseWheelHistory,
  rollDice,
  validateWheelOptions,
  wheelHistoryKey,
  wheelHistoryLimit,
  wheelSegments,
  wheelTargetRotation,
  type CoinSide,
  type WheelHistoryEntry,
  type WheelSegment,
} from '../lib/fun-random';
import './fun-random.css';

function useRevealDelay() {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  );
  const alive = useRef(true);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; finish: () => void }[]>([]);
  useEffect(() => {
    alive.current = true;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(Boolean(media?.matches));
    media?.addEventListener('change', change);
    return () => {
      alive.current = false;
      media?.removeEventListener('change', change);
      for (const item of pending.current) {
        clearTimeout(item.timer);
        item.finish();
      }
      pending.current = [];
    };
  }, []);
  const wait = (milliseconds: number) =>
    new Promise<boolean>((resolve) => {
      if (!milliseconds) {
        resolve(alive.current);
        return;
      }
      const item = {
        timer: undefined as unknown as ReturnType<typeof setTimeout>,
        finish: () => resolve(alive.current),
      };
      item.timer = setTimeout(() => {
        pending.current = pending.current.filter((entry) => entry !== item);
        item.finish();
      }, milliseconds);
      pending.current.push(item);
    });
  return { reducedMotion, wait };
}

export function LotsTool() {
  const task = useToolTask('draw-lots');
  const motion = useRevealDelay();
  const [names, setNames] = useState('小林\n小陈\n小周\n小许\n小叶\n小梁');
  const [count, setCount] = useState('1');
  const [deduplicate, setDeduplicate] = useState(true);
  const [replacement, setReplacement] = useState(false);
  const [animate, setAnimate] = useState(true);
  const [pool, setPool] = useState<string[] | null>(null);
  const [result, setResult] = useState<string[]>([]);
  let prepared: ReturnType<typeof parseNames> | null = null;
  try {
    prepared = parseNames(names, deduplicate);
  } catch {
    /* Display an actionable error when drawing. */
  }
  const reset = () => {
    setPool(null);
    setResult([]);
    task.setError('');
  };
  const draw = () =>
    task.run(async () => {
      const parsed = parseNames(names, deduplicate);
      const available = pool ?? parsed.names;
      const next = drawNames(available, Number(count), replacement);
      setResult(next.chosen);
      if (!(await motion.wait(animate && !motion.reducedMotion ? 900 : 0))) return;
      setPool(next.remaining);
    });
  return (
    <div className="tool-stack fun-random-tool">
      <Field label="抽签名单" hint="每行一个名字，最多 1,000 行；名字与结果只留在此设备。">
        <textarea
          rows={7}
          value={names}
          maxLength={50000}
          disabled={task.busy}
          onChange={(e) => {
            setNames(e.target.value);
            reset();
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void draw();
            }
          }}
        />
      </Field>
      <div className="controls-grid">
        <Field label="本次抽取数量">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            inputMode="numeric"
            value={count}
            disabled={task.busy}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>
        <div className="fun-pool-summary" aria-live="polite">
          <span>当前签池</span>
          <strong>
            {pool?.length ?? prepared?.names.length ?? 0}
            <small> 个名额</small>
          </strong>
          <span>{replacement ? '抽后放回，可再次抽中' : '抽后移出，直到重置签池'}</span>
        </div>
      </div>
      <div className="fun-checks">
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={deduplicate}
            disabled={task.busy}
            onChange={(e) => {
              setDeduplicate(e.target.checked);
              reset();
            }}
          />
          相同名字只保留一个
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={replacement}
            disabled={task.busy}
            onChange={(e) => {
              setReplacement(e.target.checked);
              reset();
            }}
          />
          抽后放回签池（允许重复）
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={animate}
            disabled={task.busy}
            onChange={(e) => setAnimate(e.target.checked)}
          />
          显示滚动动画
        </label>
      </div>
      {prepared && prepared.duplicateCount > 0 && (
        <p className="fun-hint">
          发现 {prepared.duplicateCount} 行同名：
          {deduplicate
            ? '已去重，每个不同名字机会相同。'
            : '未去重，每一行视为独立名额，同名会有更多机会。'}
        </p>
      )}
      <div className="button-row">
        <ActionButton type="button" busy={task.busy} onClick={draw}>
          <Shuffle size={17} />
          开始抽签
        </ActionButton>
        <button
          type="button"
          className="button button-secondary"
          disabled={task.busy}
          onClick={reset}
        >
          <RotateCcw size={16} />
          重置签池
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {task.busy && (
        <div className="fun-lots-window" role="status" aria-label="正在抽签">
          <div className="fun-roll-track" aria-hidden="true">
            {[0, 1].flatMap((copy) =>
              (prepared?.names || [])
                .slice(0, 6)
                .map((name, i) => <span key={`${copy}-${i}`}>{name}</span>),
            )}
          </div>
          <span className="sr-only">正在揭晓已抽取的结果</span>
        </div>
      )}
      {!task.busy && result.length > 0 && (
        <ResultBox title="抽签结果">
          <ol className="fun-lots-results" aria-label="抽签结果" aria-live="polite">
            {result.map((name, index) => (
              <li key={index}>
                <span>{index + 1}</span>
                <strong>{name}</strong>
              </li>
            ))}
          </ol>
          <CopyButton value={result.join('\n')} />
        </ResultBox>
      )}
      <Notice>
        使用浏览器安全随机数。关闭放回后，已抽名额从当前签池移出；修改名单或去重规则会重建签池。可用
        Ctrl / ⌘ + Enter 抽签。
      </Notice>
    </div>
  );
}

type EditableOption = { id: number; label: string; weight: string };
const wheelColors = [
  '#b9f97d',
  '#5bd1b1',
  '#8cb4ff',
  '#c5a0ed',
  '#f5c978',
  '#f39595',
  '#71b5ad',
  '#b6c48b',
];
function sectorPath(segment: WheelSegment) {
  const point = (angle: number) => [
    160 + 145 * Math.sin((angle * Math.PI) / 180),
    160 - 145 * Math.cos((angle * Math.PI) / 180),
  ];
  const [x1, y1] = point(segment.start);
  const [x2, y2] = point(segment.end);
  return `M 160 160 L ${x1} ${y1} A 145 145 0 ${segment.end - segment.start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}
function useWheelHistory() {
  const [initial] = useState(() => {
    try {
      const parsed = parseWheelHistory(localStorage.getItem(wheelHistoryKey));
      return {
        history: parsed.history,
        warning: parsed.corrupted ? '部分历史格式不正确，已跳过无法读取的记录。' : '',
      };
    } catch {
      return {
        history: [] as WheelHistoryEntry[],
        warning: '浏览器未允许本地存储，本页记录关闭后将不保留。',
      };
    }
  });
  const [history, setHistory] = useState(initial.history);
  const [warning, setWarning] = useState(initial.warning);
  const add = (label: string) => {
    const next = [{ label, at: new Date().toISOString() }, ...history].slice(0, wheelHistoryLimit);
    setHistory(next);
    try {
      localStorage.setItem(wheelHistoryKey, JSON.stringify(next));
      setWarning('');
    } catch {
      setWarning('浏览器未允许保存，本页记录关闭后将不保留。');
    }
  };
  const clear = () => {
    setHistory([]);
    try {
      localStorage.removeItem(wheelHistoryKey);
      setWarning('');
    } catch {
      setWarning('已清空本页显示；浏览器拒绝访问存储，旧历史重新打开时可能恢复。');
    }
  };
  return { history, warning, add, clear };
}

export function WheelTool() {
  const task = useToolTask('wheel');
  const motion = useRevealDelay();
  const stored = useWheelHistory();
  const [options, setOptions] = useState<EditableOption[]>(
    Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      label: `选项${['一', '二', '三', '四'][i]}`,
      weight: '1',
    })),
  );
  const nextId = useRef(5);
  const [animate, setAnimate] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState('');
  let segments: WheelSegment[] = [];
  try {
    segments = wheelSegments(
      options.map(({ label, weight }) => ({ label, weight: Number(weight) })),
    );
  } catch {
    /* Invalid drafts remain editable. */
  }
  const total = segments.reduce((sum, item) => sum + item.weight, 0);
  const update = (id: number, updateValue: Partial<EditableOption>) => {
    setOptions((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...updateValue } : item)),
    );
    setResult('');
    task.setError('');
  };
  const spin = () =>
    task.run(async () => {
      const valid = validateWheelOptions(
        options.map(({ label, weight }) => ({ label, weight: Number(weight) })),
      );
      const selected = chooseWeighted(valid);
      const target = wheelSegments(valid)[selected.index];
      setResult(selected.option.label);
      setRotation((previous) => wheelTargetRotation(previous, target.middle));
      if (!(await motion.wait(animate && !motion.reducedMotion ? 2400 : 0))) return;
      stored.add(selected.option.label);
    });
  return (
    <div className="tool-stack fun-random-tool">
      <div className="fun-wheel-layout">
        <div className="fun-wheel-stage">
          <div className="fun-wheel-frame" aria-hidden="true">
            <svg className="fun-wheel-pointer" viewBox="0 0 28 32">
              <path d="M 2 2 L 26 2 L 14 30 Z" />
            </svg>
            <svg
              className="fun-wheel-face"
              viewBox="0 0 320 320"
              style={{
                transform: `rotate(${rotation}deg)`,
                transitionDuration:
                  task.busy && animate && !motion.reducedMotion ? '2400ms' : '0ms',
              }}
            >
              {segments.map((segment, i) => (
                <g key={i}>
                  <path d={sectorPath(segment)} fill={wheelColors[i % wheelColors.length]} />
                  {segment.end - segment.start >= 12 && (
                    <text
                      x={160 + 108 * Math.sin((segment.middle * Math.PI) / 180)}
                      y={160 - 108 * Math.cos((segment.middle * Math.PI) / 180)}
                      dy=".35em"
                      textAnchor="middle"
                    >
                      {i + 1}
                    </text>
                  )}
                </g>
              ))}
              <circle cx="160" cy="160" r="23" className="fun-wheel-hub" />
            </svg>
            {!segments.length && (
              <span className="fun-wheel-empty">
                填写有效选项
                <br />
                即可预览转盘
              </span>
            )}
          </div>
          <p className="fun-hint">顶部指针指向抽中扇区，扇区大小按权重绘制。</p>
          <div
            className="fun-wheel-announcement"
            role="status"
            aria-label="转盘结果"
            aria-live="polite"
          >
            {task.busy ? (
              '正在转动…'
            ) : result ? (
              <>
                本次抽中 <strong>{result}</strong>
              </>
            ) : (
              '准备好，就转一下。'
            )}
          </div>
        </div>
        <div className="fun-wheel-settings">
          <div className="fun-option-heading">
            <span>选项名称</span>
            <span>权重</span>
          </div>
          <div className="fun-wheel-options">
            {options.map((option, index) => (
              <div className="fun-wheel-option" key={option.id}>
                <span
                  className="fun-option-index"
                  style={{ backgroundColor: wheelColors[index % wheelColors.length] }}
                >
                  {index + 1}
                </span>
                <input
                  aria-label={`选项 ${index + 1} 名称`}
                  value={option.label}
                  maxLength={80}
                  disabled={task.busy}
                  onChange={(e) => update(option.id, { label: e.target.value })}
                />
                <input
                  aria-label={`选项 ${index + 1} 权重`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  step={1}
                  value={option.weight}
                  disabled={task.busy}
                  onChange={(e) => update(option.id, { weight: e.target.value })}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`删除选项 ${index + 1}`}
                  disabled={task.busy || options.length <= 2}
                  onClick={() => {
                    setOptions((items) => items.filter((item) => item.id !== option.id));
                    setResult('');
                  }}
                >
                  <Trash2 size={17} />
                </button>
                <small>
                  {segments[index]
                    ? `机会约 ${((segments[index].weight / total) * 100).toFixed(1)}%`
                    : '检查名称与权重'}
                </small>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={task.busy || options.length >= 24}
            onClick={() => {
              setOptions((items) => [...items, { id: nextId.current++, label: '', weight: '1' }]);
              setResult('');
            }}
          >
            <Plus size={16} />
            添加选项
          </button>
          <p className="fun-hint">
            2～24 个不同选项；权重为 1～1,000 的整数，权重越大，抽中机会越高。
          </p>
        </div>
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={animate}
          disabled={task.busy}
          onChange={(e) => setAnimate(e.target.checked)}
        />
        播放旋转动画
      </label>
      <div className="button-row">
        <ActionButton type="button" busy={task.busy} onClick={spin}>
          <Shuffle size={17} />
          转一下
        </ActionButton>
        {result && !task.busy && <CopyButton value={result} />}
      </div>
      <ErrorNotice error={task.error} />
      {stored.warning && <Notice tone="warning">{stored.warning}</Notice>}
      <section className="fun-history">
        <div className="fun-section-heading">
          <h2>本机抽奖记录</h2>
          <button
            type="button"
            className="button button-secondary"
            disabled={task.busy || !stored.history.length}
            onClick={stored.clear}
          >
            <Trash2 size={16} />
            清空历史
          </button>
        </div>
        <p className="fun-hint">仅保存在当前浏览器，最多保留最近 20 次；选项和结果不会上传。</p>
        {stored.history.length ? (
          <ol className="fun-history-list">
            {stored.history.map((item, i) => (
              <li key={`${item.at}-${i}`}>
                <strong>{item.label}</strong>
                <time dateTime={item.at}>
                  {new Date(item.at).toLocaleString('zh-CN', { hour12: false })}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="fun-empty">还没有抽奖记录，第一次结果会出现在这里。</p>
        )}
      </section>
      <Notice>
        结果由安全随机数和实际权重决定，再由动画展示。调整动画不会改变抽取概率；适合日常选择，不用于付费抽奖或赌博。
      </Notice>
    </div>
  );
}

export function CoinTool() {
  const task = useToolTask('coin');
  const motion = useRevealDelay();
  const [batchCount, setBatchCount] = useState('10');
  const [animate, setAnimate] = useState(true);
  const [result, setResult] = useState<CoinSide[]>([]);
  const [stats, setStats] = useState({ heads: 0, tails: 0 });
  const [rotation, setRotation] = useState(0);
  const flip = (count: number) =>
    task.run(async () => {
      const next = flipCoins(count);
      setResult(next);
      const end = next[next.length - 1] === 'heads' ? 0 : 180;
      setRotation((previous) => previous + 6 * 360 + ((end - (previous % 360) + 360) % 360));
      if (!(await motion.wait(animate && !motion.reducedMotion ? 1200 : 0))) return;
      const heads = next.filter((item) => item === 'heads').length;
      setStats((previous) => ({
        heads: previous.heads + heads,
        tails: previous.tails + next.length - heads,
      }));
    });
  const total = stats.heads + stats.tails;
  return (
    <div className="tool-stack fun-random-tool">
      <div className="fun-coin-stage">
        <div className="fun-coin-perspective" aria-hidden="true">
          <div
            className="fun-coin-inner"
            style={{
              transform: `rotateY(${rotation}deg)`,
              transitionDuration: task.busy && animate && !motion.reducedMotion ? '1200ms' : '0ms',
            }}
          >
            <div className="fun-coin-side fun-coin-heads">
              <span>正</span>
              <small>正面</small>
            </div>
            <div className="fun-coin-side fun-coin-tails">
              <span>反</span>
              <small>反面</small>
            </div>
          </div>
        </div>
        <p role="status" aria-live="polite">
          {task.busy
            ? '硬币翻转中…'
            : result.length
              ? `最后一枚：${result[result.length - 1] === 'heads' ? '正面' : '反面'}`
              : '抛起一枚硬币，让选择轻一点。'}
        </p>
      </div>
      <div className="controls-grid">
        <Field label="连续次数" hint="1～1,000 次；每次独立抽取，单次正反面机会各半。">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            inputMode="numeric"
            value={batchCount}
            disabled={task.busy}
            onChange={(e) => setBatchCount(e.target.value)}
          />
        </Field>
        <div className="fun-coin-settings">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={animate}
              disabled={task.busy}
              onChange={(e) => setAnimate(e.target.checked)}
            />
            播放翻转动画
          </label>
          <span className="fun-hint">连续模式展示最后一枚的动画，完整结果在下方列出。</span>
        </div>
      </div>
      <div className="button-row">
        <ActionButton type="button" busy={task.busy} onClick={() => flip(1)}>
          <Coins size={17} />
          抛一次
        </ActionButton>
        <button
          type="button"
          className="button button-secondary"
          disabled={task.busy}
          onClick={() => void flip(Number(batchCount))}
        >
          连续抛掷
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={task.busy}
          onClick={() => {
            setStats({ heads: 0, tails: 0 });
            setResult([]);
            setRotation(0);
            task.setError('');
          }}
        >
          <RotateCcw size={16} />
          重置统计
        </button>
      </div>
      <ErrorNotice error={task.error} />
      <dl className="fun-tally" aria-label="硬币累计统计">
        <div>
          <dt>正面次数</dt>
          <dd>{stats.heads}</dd>
        </div>
        <div>
          <dt>反面次数</dt>
          <dd>{stats.tails}</dd>
        </div>
        <div>
          <dt>累计次数</dt>
          <dd>{total}</dd>
        </div>
      </dl>
      {result.length > 0 && !task.busy && (
        <ResultBox title={`本轮 ${result.length} 次结果`}>
          <textarea
            className="fun-result-text"
            aria-label="硬币结果"
            rows={Math.min(7, Math.ceil(result.length / 12) + 1)}
            readOnly
            value={result
              .map((item, index) => `${index + 1}. ${item === 'heads' ? '正面' : '反面'}`)
              .join('　')}
          />
          <CopyButton
            value={result.map((item) => (item === 'heads' ? '正面' : '反面')).join('\n')}
          />
        </ResultBox>
      )}
      <Notice>
        采用安全随机抽样，不依赖动画或手速。累计统计只保留在当前页面，刷新或重置后归零；有限次数的比例不代表下一次结果。
      </Notice>
    </div>
  );
}

export function DiceTool() {
  const task = useToolTask('dice');
  const motion = useRevealDelay();
  const [count, setCount] = useState(2);
  const [sides, setSides] = useState(6);
  const [animate, setAnimate] = useState(true);
  const [result, setResult] = useState<number[]>([]);
  const roll = () =>
    task.run(async () => {
      const next = rollDice(count, sides);
      setResult(next);
      await motion.wait(animate && !motion.reducedMotion ? 900 : 0);
    });
  const total = result.reduce((sum, value) => sum + value, 0);
  return (
    <div className="tool-stack fun-random-tool">
      <div className="controls-grid">
        <Field label="骰子数量">
          <select
            value={count}
            disabled={task.busy}
            onChange={(e) => {
              setCount(Number(e.target.value));
              setResult([]);
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <option key={value} value={value}>
                {value} 个
              </option>
            ))}
          </select>
        </Field>
        <Field label="每个骰子的面数">
          <select
            value={sides}
            disabled={task.busy}
            onChange={(e) => {
              setSides(Number(e.target.value));
              setResult([]);
            }}
          >
            {diceSides.map((value) => (
              <option key={value} value={value}>
                {value} 面
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={animate}
          disabled={task.busy}
          onChange={(e) => setAnimate(e.target.checked)}
        />
        显示掷骰动画
      </label>
      <div className="button-row">
        <ActionButton type="button" busy={task.busy} onClick={roll}>
          <Dice5 size={17} />
          掷骰子
        </ActionButton>
        <button
          type="button"
          className="button button-secondary"
          disabled={task.busy}
          onClick={() => {
            setResult([]);
            task.setError('');
          }}
        >
          <RotateCcw size={16} />
          清空结果
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result.length ? (
        <ResultBox title={task.busy ? '骰子滚动中…' : '本次点数'}>
          <div
            className={`fun-dice-row ${task.busy && animate && !motion.reducedMotion ? 'is-rolling' : ''}`}
            aria-label="各骰子点数"
            aria-busy={task.busy}
          >
            {result.map((value, index) => (
              <div className="fun-die" key={index}>
                <span>
                  第 {index + 1} 个 · {sides} 面
                </span>
                <strong aria-label={`骰子 ${index + 1} 点数`}>{task.busy ? '·' : value}</strong>
              </div>
            ))}
          </div>
          {!task.busy && (
            <>
              <p className="fun-dice-total">
                总和 <output aria-label="骰子总和">{total}</output>
              </p>
              <CopyButton value={`点数：${result.join('、')}\n总和：${total}`} />
            </>
          )}
        </ResultBox>
      ) : (
        <div className="fun-dice-empty">
          <Dice5 size={44} strokeWidth={1.3} />
          <p>选择骰子，掷出这一轮。</p>
        </div>
      )}
      <Notice>
        每个骰子独立抽取，所有点数机会相同。结果在动画开始前计算，不会因动画时长或重复渲染重新抽取。
      </Notice>
    </div>
  );
}
