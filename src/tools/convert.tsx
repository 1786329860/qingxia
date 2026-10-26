import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Clock3, Download, Eraser } from 'lucide-react';
import {
  ActionButton,
  CopyButton,
  ErrorNotice,
  Field,
  Notice,
  ResultBox,
  useToolTask,
} from '../components/ToolUI';
import { downloadText } from '../lib/files';
import { trackToolUse } from '../lib/analytics';
import { parseRadix, parseShanghaiDate, timestampToMilliseconds } from '../lib/text-convert';

function useDebouncedUsage(tool: string, key: string, valid: boolean) {
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key || !valid) return;
    const timer = window.setTimeout(() => {
      previous.current = key;
      trackToolUse(tool);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [key, tool, valid]);
}

type Unit = { id: string; label: string; factor: number };
type UnitCategory = { id: string; name: string; units: Unit[] };
const CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    name: '长度',
    units: [
      { id: 'm', label: '米 m', factor: 1 },
      { id: 'km', label: '千米 km', factor: 1000 },
      { id: 'cm', label: '厘米 cm', factor: 0.01 },
      { id: 'mm', label: '毫米 mm', factor: 0.001 },
      { id: 'um', label: '微米 μm', factor: 0.000001 },
      { id: 'in', label: '英寸 in', factor: 0.0254 },
      { id: 'ft', label: '英尺 ft', factor: 0.3048 },
      { id: 'yd', label: '码 yd', factor: 0.9144 },
      { id: 'mi', label: '英里 mi', factor: 1609.344 },
      { id: 'nmi', label: '海里 nmi', factor: 1852 },
    ],
  },
  {
    id: 'mass',
    name: '重量',
    units: [
      { id: 'kg', label: '千克 kg', factor: 1 },
      { id: 'g', label: '克 g', factor: 0.001 },
      { id: 'mg', label: '毫克 mg', factor: 0.000001 },
      { id: 't', label: '吨 t', factor: 1000 },
      { id: 'jin', label: '市斤', factor: 0.5 },
      { id: 'liang', label: '市两', factor: 0.05 },
      { id: 'lb', label: '磅 lb', factor: 0.45359237 },
      { id: 'oz', label: '盎司 oz', factor: 0.028349523125 },
    ],
  },
  {
    id: 'temperature',
    name: '温度',
    units: [
      { id: 'c', label: '摄氏度 °C', factor: 1 },
      { id: 'f', label: '华氏度 °F', factor: 1 },
      { id: 'k', label: '开尔文 K', factor: 1 },
    ],
  },
  {
    id: 'area',
    name: '面积',
    units: [
      { id: 'm2', label: '平方米 m²', factor: 1 },
      { id: 'km2', label: '平方千米 km²', factor: 1000000 },
      { id: 'cm2', label: '平方厘米 cm²', factor: 0.0001 },
      { id: 'ha', label: '公顷 ha', factor: 10000 },
      { id: 'mu', label: '市亩', factor: 2000 / 3 },
      { id: 'ft2', label: '平方英尺 ft²', factor: 0.09290304 },
      { id: 'acre', label: '英亩 acre', factor: 4046.8564224 },
    ],
  },
  {
    id: 'volume',
    name: '体积',
    units: [
      { id: 'l', label: '升 L', factor: 1 },
      { id: 'ml', label: '毫升 mL', factor: 0.001 },
      { id: 'm3', label: '立方米 m³', factor: 1000 },
      { id: 'cm3', label: '立方厘米 cm³', factor: 0.001 },
      { id: 'gal', label: '美制加仑 gal', factor: 3.785411784 },
      { id: 'ukgal', label: '英制加仑 gal', factor: 4.54609 },
      { id: 'floz', label: '美制液量盎司 fl oz', factor: 0.0295735295625 },
    ],
  },
  {
    id: 'speed',
    name: '速度',
    units: [
      { id: 'ms', label: '米/秒 m/s', factor: 1 },
      { id: 'kmh', label: '千米/时 km/h', factor: 1 / 3.6 },
      { id: 'mph', label: '英里/时 mph', factor: 0.44704 },
      { id: 'knot', label: '节 kn', factor: 1852 / 3600 },
      { id: 'fts', label: '英尺/秒 ft/s', factor: 0.3048 },
    ],
  },
  {
    id: 'data',
    name: '数据存储',
    units: [
      { id: 'B', label: '字节 B', factor: 1 },
      { id: 'bit', label: '比特 bit', factor: 0.125 },
      { id: 'KB', label: '千字节 KB（1000）', factor: 1000 },
      { id: 'MB', label: '兆字节 MB（1000²）', factor: 1000000 },
      { id: 'GB', label: '吉字节 GB（1000³）', factor: 1000000000 },
      { id: 'TB', label: '太字节 TB（1000⁴）', factor: 1000000000000 },
      { id: 'KiB', label: 'KiB（1024）', factor: 1024 },
      { id: 'MiB', label: 'MiB（1024²）', factor: 1048576 },
      { id: 'GiB', label: 'GiB（1024³）', factor: 1073741824 },
      { id: 'TiB', label: 'TiB（1024⁴）', factor: 1099511627776 },
    ],
  },
];
function convertUnit(input: number, category: string, from: Unit, to: Unit): number {
  if (category === 'temperature') {
    const celsius =
      from.id === 'c' ? input : from.id === 'f' ? ((input - 32) * 5) / 9 : input - 273.15;
    if (celsius < -273.1500000001) throw new Error('温度不能低于绝对零度（−273.15°C / 0 K）。');
    return to.id === 'c' ? celsius : to.id === 'f' ? (celsius * 9) / 5 + 32 : celsius + 273.15;
  }
  return (input * from.factor) / to.factor;
}
function numberText(value: number) {
  return Object.is(value, -0) || Math.abs(value) < Number.MIN_VALUE
    ? '0'
    : Number(value.toPrecision(14)).toString();
}

export function UnitsTool() {
  const [categoryId, setCategoryId] = useState('length');
  const category = CATEGORIES.find((category) => category.id === categoryId)!;
  const [fromId, setFromId] = useState('m');
  const [toId, setToId] = useState('km');
  const [input, setInput] = useState('1');
  const from = category.units.find((unit) => unit.id === fromId) || category.units[0];
  const to = category.units.find((unit) => unit.id === toId) || category.units[1];
  const calculation = useMemo(() => {
    if (!input.trim())
      return { output: '', error: '', values: [] as { unit: Unit; value: string }[] };
    if (
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim()) ||
      !Number.isFinite(Number(input))
    )
      return { output: '', error: '请输入有效数值，支持小数、负数和科学计数法。', values: [] };
    try {
      const value = convertUnit(Number(input), categoryId, from, to);
      if (!Number.isFinite(value)) throw new Error('结果超出浏览器数值范围，请缩小输入。');
      const values = category.units.map((unit) => {
        const result = convertUnit(Number(input), categoryId, from, unit);
        return { unit, value: Number.isFinite(result) ? numberText(result) : '超出数值范围' };
      });
      return { output: numberText(value), error: '', values };
    } catch (error) {
      return {
        output: '',
        error: error instanceof Error ? error.message : '换算失败。',
        values: [],
      };
    }
  }, [input, categoryId, from, to, category.units]);
  useDebouncedUsage(
    'units',
    `${categoryId}:${from.id}:${to.id}:${input}`,
    !!calculation.output && !calculation.error,
  );
  const summary = `${input} ${from.label} = ${calculation.output} ${to.label}`;
  return (
    <div className="tool-workspace">
      <div className="filter-tabs" role="group" aria-label="单位类别">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            className={`filter-tab ${categoryId === item.id ? 'active' : ''}`}
            onClick={() => {
              setCategoryId(item.id);
              setFromId(item.units[0].id);
              setToId(item.units[1].id);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="controls-grid">
        <Field label="输入数值">
          <input
            value={input}
            inputMode="decimal"
            onChange={(event) => setInput(event.target.value)}
            placeholder="输入数值，即时换算"
          />
        </Field>
        <Field label="原始单位">
          <select value={from.id} onChange={(event) => setFromId(event.target.value)}>
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="目标单位">
          <select value={to.id} onChange={(event) => setToId(event.target.value)}>
            {category.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="button-row">
        <button
          className="button button-secondary"
          onClick={() => {
            setFromId(to.id);
            setToId(from.id);
            if (calculation.output) setInput(calculation.output);
          }}
        >
          <ArrowRightLeft size={16} />
          交换单位
        </button>
        <button className="button button-ghost" onClick={() => setInput('')}>
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={calculation.error} />
      {calculation.output && (
        <ResultBox title="即时换算结果">
          <p className="conversion-result">
            <strong>{calculation.output}</strong>
            <span> {to.label}</span>
          </p>
          <p className="muted">{summary}</p>
          <div className="button-row">
            <CopyButton value={summary} />
            <button
              className="button button-secondary"
              onClick={() => downloadText(summary, '轻匣-单位换算.txt')}
            >
              <Download size={16} />
              下载结果
            </button>
          </div>
          <div className="unit-results">
            {calculation.values.map(({ unit, value }) => (
              <div className="unit-result" key={unit.id}>
                <span>{unit.label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </ResultBox>
      )}
      <Notice>
        {categoryId === 'data'
          ? 'KB / MB / GB 使用十进制 1000；KiB / MiB / GiB 使用二进制 1024，避免混淆。'
          : categoryId === 'mass'
            ? '市斤按 500 克、市两按 50 克计算。数值结果最多显示 14 位有效数字。'
            : '输入后自动换算，结果最多显示 14 位有效数字，适用于日常换算。'}
      </Notice>
    </div>
  );
}

// The UI explicitly uses fixed UTC+8, including historical dates, rather than the browser's timezone.
function fixedShanghaiInput(milliseconds: number) {
  const date = new Date(milliseconds + 8 * 3600000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new Error('日期年份需在 0001～9999 之间。');
  return `${date.getUTCFullYear().toString().padStart(4, '0')}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}T${date.getUTCHours().toString().padStart(2, '0')}:${date.getUTCMinutes().toString().padStart(2, '0')}:${date.getUTCSeconds().toString().padStart(2, '0')}`;
}

export function TimestampTool() {
  const [now, setNow] = useState(Date.now());
  const [stamp, setStamp] = useState(() => Math.floor(Date.now() / 1000).toString());
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds');
  const [date, setDate] = useState(() => fixedShanghaiInput(Date.now()));
  const [dateResult, setDateResult] = useState('');
  const [stampResult, setStampResult] = useState<{ seconds: string; milliseconds: string } | null>(
    null,
  );
  const task = useToolTask('timestamp');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const summary = [
    dateResult ? `时间戳 ${stamp}（${unit === 'seconds' ? '秒' : '毫秒'}） = ${dateResult}` : '',
    stampResult
      ? `${date.replace('T', ' ')} UTC+8\n秒：${stampResult.seconds}\n毫秒：${stampResult.milliseconds}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return (
    <div className="tool-workspace">
      <div className="stat-card">
        <span className="section-eyebrow">
          <Clock3 size={15} /> 当前 Unix 时间戳
        </span>
        <strong className="timestamp-live">{Math.floor(now / 1000)}</strong>
        <div className="button-row">
          <span className="muted">秒 · 自动更新</span>
          <button
            className="button button-secondary"
            onClick={() => {
              setStamp(
                unit === 'seconds'
                  ? Math.floor(Date.now() / 1000).toString()
                  : Date.now().toString(),
              );
              setDate(fixedShanghaiInput(Date.now()));
              setDateResult('');
              setStampResult(null);
              task.setError('');
            }}
          >
            使用当前时间
          </button>
        </div>
      </div>
      <Notice>
        日期统一使用北京时间（固定 UTC+8），不随设备时区变化。Unix
        时间戳本身不包含时区；历史日期也按固定 UTC+8 换算。
      </Notice>
      <div className="controls-grid">
        <section className="result-box">
          <h3>时间戳 → 日期时间</h3>
          <Field label="Unix 时间戳">
            <input
              value={stamp}
              onChange={(event) => {
                setStamp(event.target.value);
                setDateResult('');
                task.setError('');
              }}
              inputMode="numeric"
              placeholder="例如 1735689600"
            />
          </Field>
          <Field label="时间戳单位">
            <select
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value as typeof unit);
                setDateResult('');
                task.setError('');
              }}
            >
              <option value="seconds">秒（s）</option>
              <option value="milliseconds">毫秒（ms）</option>
            </select>
          </Field>
          <ActionButton
            busy={task.busy}
            onClick={() =>
              task.run(() => {
                const milliseconds = timestampToMilliseconds(stamp, unit);
                const value = fixedShanghaiInput(milliseconds);
                const subsecond = ((milliseconds % 1000) + 1000) % 1000;
                setDateResult(
                  `${value.replace('T', ' ')}${subsecond ? `.${subsecond.toString().padStart(3, '0')}` : ''} UTC+8`,
                );
              })
            }
          >
            转换为日期
          </ActionButton>
          {dateResult && (
            <div className="result-value">
              <p>{dateResult}</p>
              <CopyButton value={dateResult} />
            </div>
          )}
        </section>
        <section className="result-box">
          <h3>日期时间 → 时间戳</h3>
          <Field label="日期时间（北京时间 UTC+8）">
            <input
              type="datetime-local"
              step="1"
              min="0001-01-01T00:00:00"
              max="9999-12-31T23:59:59"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setStampResult(null);
                task.setError('');
              }}
            />
          </Field>
          <ActionButton
            busy={task.busy}
            onClick={() =>
              task.run(() => {
                const milliseconds = parseShanghaiDate(date);
                setStampResult({
                  milliseconds: String(milliseconds),
                  seconds: String(Math.floor(milliseconds / 1000)),
                });
              })
            }
          >
            转换为时间戳
          </ActionButton>
          {stampResult && (
            <div className="result-value">
              <p>
                <span className="muted">秒 </span>
                <strong>{stampResult.seconds}</strong>
              </p>
              <p>
                <span className="muted">毫秒 </span>
                <strong>{stampResult.milliseconds}</strong>
              </p>
              <CopyButton value={`${stampResult.seconds}\n${stampResult.milliseconds}`} />
            </div>
          )}
        </section>
      </div>
      <ErrorNotice error={task.error} />
      <div className="button-row">
        {summary && (
          <button
            className="button button-secondary"
            onClick={() => downloadText(summary, '轻匣-时间戳换算.txt')}
          >
            <Download size={16} />
            下载结果
          </button>
        )}
        <button
          className="button button-ghost"
          onClick={() => {
            setStamp('');
            setDate('');
            setDateResult('');
            setStampResult(null);
            task.setError('');
          }}
        >
          <Eraser size={16} />
          清空
        </button>
      </div>
    </div>
  );
}

const RADICES = [
  { radix: 2, name: '二进制', short: 'BIN' },
  { radix: 8, name: '八进制', short: 'OCT' },
  { radix: 10, name: '十进制', short: 'DEC' },
  { radix: 16, name: '十六进制', short: 'HEX' },
];
export function RadixTool() {
  const [input, setInput] = useState('255');
  const [radix, setRadix] = useState(10);
  const [uppercase, setUppercase] = useState(true);
  const calculation = useMemo(() => {
    if (!input.trim())
      return {
        values: [] as { radix: number; name: string; short: string; value: string }[],
        error: '',
      };
    try {
      const value = parseRadix(input, radix);
      return {
        values: RADICES.map((item) => ({
          ...item,
          value:
            item.radix === 16 && uppercase
              ? value.toString(item.radix).toUpperCase()
              : value.toString(item.radix),
        })),
        error: '',
      };
    } catch (error) {
      return { values: [], error: error instanceof Error ? error.message : '转换失败。' };
    }
  }, [input, radix, uppercase]);
  useDebouncedUsage('radix', `${radix}:${input}`, calculation.values.length > 0);
  return (
    <div className="tool-workspace">
      <div className="controls-grid">
        <Field label="原始进制">
          <select value={radix} onChange={(event) => setRadix(Number(event.target.value))}>
            {RADICES.map((item) => (
              <option key={item.radix} value={item.radix}>
                {item.name}（{item.radix}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="输入整数" hint="支持负数；二 / 八 / 十六进制可带 0b / 0o / 0x 前缀。">
          <input
            className="code-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如 255 或 -255"
            autoCapitalize="off"
            spellCheck={false}
          />
        </Field>
      </div>
      <div className="button-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={uppercase}
            onChange={(event) => setUppercase(event.target.checked)}
          />
          十六进制使用大写字母
        </label>
        <button className="button button-ghost" onClick={() => setInput('')}>
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={calculation.error} />
      {calculation.values.length > 0 && (
        <ResultBox title="进制转换结果">
          {calculation.values.map((item) => (
            <div className="radix-result" key={item.radix}>
              <div>
                <span className="section-eyebrow">
                  {item.short} · {item.name}
                </span>
                <pre>{item.value}</pre>
              </div>
              <CopyButton value={item.value} />
            </div>
          ))}
          <button
            className="button button-secondary"
            onClick={() =>
              downloadText(
                calculation.values
                  .map((item) => `${item.name}（${item.radix}）：${item.value}`)
                  .join('\n'),
                '轻匣-进制换算.txt',
              )
            }
          >
            <Download size={16} />
            下载全部结果
          </button>
        </ResultBox>
      )}
      <Notice>
        使用 BigInt 精确处理整数，不会因超过 2⁵³ 而丢失精度。最多输入 4,096
        个字符，不支持小数和补码表示。
      </Notice>
    </div>
  );
}
