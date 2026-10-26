import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  FileKey2,
  Fingerprint,
  Palette,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  ActionButton,
  CopyButton,
  DownloadButton,
  ErrorNotice,
  Field,
  FileDropzone,
  Notice,
  Progress,
  ResultBox,
  useToolTask,
} from '../components/ToolUI';
import { checkFileSize, downloadText, formatBytes } from '../lib/files';
import {
  colorContrast,
  parseColor,
  secureRandomString,
  secureUuid,
  type ParsedColor,
} from '../lib/developer-utils';

export function QrTool() {
  const task = useToolTask('qr');
  const [text, setText] = useState('');
  const [size, setSize] = useState(512);
  const [level, setLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [dark, setDark] = useState('#14251C');
  const [light, setLight] = useState('#FFFFFF');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!blob) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  const contrast = colorContrast(dark, light);
  const generate = () =>
    task.run(async () => {
      if (!text.trim()) throw new Error('请输入需要生成二维码的文本或网址。');
      if (new TextEncoder().encode(text).length > 2953)
        throw new Error('内容超过二维码容量上限，请缩短文本；中文字符通常占用多个字节。');
      if (contrast < 1.1) throw new Error('前景色与背景色太接近，请提高对比度。');
      const canvas = document.createElement('canvas');
      try {
        await QRCode.toCanvas(canvas, text, {
          width: size,
          margin: 4,
          errorCorrectionLevel: level,
          color: { dark, light },
        });
      } catch {
        throw new Error('内容超过当前容错级别的二维码容量，请缩短内容或降低容错级别。');
      }
      const result = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('浏览器无法导出 PNG 图片。'))),
          'image/png',
        ),
      );
      setBlob(result);
    });
  return (
    <div className="tool-stack">
      <Field label="文本或网址" hint="二维码在你的浏览器中生成，不会提交输入内容。">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setBlob(null);
          }}
          placeholder="输入网址、文字或其他想分享的内容…"
          rows={5}
          maxLength={3000}
        />
      </Field>
      <div className="controls-grid">
        <Field label="图片尺寸">
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setBlob(null);
            }}
          >
            {[256, 512, 1024, 2048].map((n) => (
              <option value={n} key={n}>
                {n} × {n} px
              </option>
            ))}
          </select>
        </Field>
        <Field label="容错级别" hint="更高容错适合印刷，但可容纳的文字更少。">
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as typeof level);
              setBlob(null);
            }}
          >
            <option value="L">L · 约 7%</option>
            <option value="M">M · 约 15%（推荐）</option>
            <option value="Q">Q · 约 25%</option>
            <option value="H">H · 约 30%</option>
          </select>
        </Field>
        <Field label="前景颜色">
          <input
            type="color"
            value={dark}
            onChange={(e) => {
              setDark(e.target.value);
              setBlob(null);
            }}
          />
        </Field>
        <Field label="背景颜色">
          <input
            type="color"
            value={light}
            onChange={(e) => {
              setLight(e.target.value);
              setBlob(null);
            }}
          />
        </Field>
      </div>
      {contrast < 4.5 && (
        <Notice tone="warning">
          颜色对比度较低，部分设备可能难以识别。建议使用深色前景和浅色背景。
        </Notice>
      )}
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={generate}>
          <QrCode size={17} />
          生成二维码
        </ActionButton>
        <button
          className="button button-secondary"
          onClick={() => {
            setText('');
            setBlob(null);
            task.setError('');
          }}
        >
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {blob && preview && (
        <ResultBox title="你的二维码已就绪">
          <div className="qr-result" style={{ display: 'grid', justifyItems: 'center', gap: 18 }}>
            <img
              src={preview}
              alt="根据输入生成的二维码"
              width={256}
              height={256}
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 14 }}
            />
            <p className="muted">
              {size} × {size} px · PNG · {formatBytes(blob.size)}
            </p>
            <DownloadButton blob={blob} name="轻匣-二维码.png" />
          </div>
        </ResultBox>
      )}
      <Notice>
        二维码中包含你输入的原文，下载并分享前请自行确认内容。生成后建议用手机扫描一次。
      </Notice>
    </div>
  );
}

type HashAlgorithm = 'md5' | 'sha1' | 'sha256';
const algorithmNames: Record<HashAlgorithm, string> = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
};
export function HashTool() {
  const task = useToolTask('hash');
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>('sha256');
  const [digest, setDigest] = useState('');
  const [upper, setUpper] = useState(false);
  const worker = useRef<Worker | null>(null);
  const rejectPending = useRef<((reason: Error) => void) | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      rejectPending.current?.(new Error('处理已停止。'));
    },
    [],
  );
  const clearResult = () => {
    setDigest('');
    task.setError('');
  };
  const calculate = () =>
    task.run(async () => {
      setDigest('');
      if (mode === 'text') {
        if (new TextEncoder().encode(text).length > 5 * 1024 * 1024)
          throw new Error('文本超过 5 MB，请改为选择文件后计算。');
        const { md5, sha1, sha256 } = await import('hash-wasm');
        setDigest(
          await (algorithm === 'md5'
            ? md5(text)
            : algorithm === 'sha1'
              ? sha1(text)
              : sha256(text)),
        );
      } else {
        if (!file) throw new Error('请先选择要计算哈希的文件。');
        checkFileSize(file, 500);
        const result = await new Promise<string>((resolve, reject) => {
          const instance = new Worker(new URL('../workers/hash.worker.ts', import.meta.url), {
            type: 'module',
          });
          worker.current = instance;
          rejectPending.current = reject;
          instance.onmessage = (
            event: MessageEvent<{
              type: string;
              value?: number;
              digest?: string;
              message?: string;
            }>,
          ) => {
            if (event.data.type === 'progress') task.setProgress(event.data.value || 0);
            else if (event.data.type === 'result') {
              instance.terminate();
              worker.current = null;
              rejectPending.current = null;
              resolve(event.data.digest || '');
            } else {
              instance.terminate();
              worker.current = null;
              rejectPending.current = null;
              reject(new Error(event.data.message || '哈希计算失败。'));
            }
          };
          instance.onerror = () => {
            instance.terminate();
            worker.current = null;
            rejectPending.current = null;
            reject(new Error('计算组件加载失败，请刷新后重试。'));
          };
          instance.postMessage({ file, algorithm });
        });
        setDigest(result);
      }
    });
  const output = upper ? digest.toUpperCase() : digest;
  return (
    <div className="tool-stack">
      <div className="controls-grid">
        <Field label="输入类型">
          <select
            disabled={task.busy}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              clearResult();
            }}
          >
            <option value="text">文本 · UTF-8</option>
            <option value="file">本地文件</option>
          </select>
        </Field>
        <Field label="哈希算法">
          <select
            disabled={task.busy}
            value={algorithm}
            onChange={(e) => {
              setAlgorithm(e.target.value as HashAlgorithm);
              clearResult();
            }}
          >
            <option value="sha256">SHA-256（推荐）</option>
            <option value="sha1">SHA-1</option>
            <option value="md5">MD5</option>
          </select>
        </Field>
      </div>
      {mode === 'text' ? (
        <Field label="原始文本" hint="换行、空格也会参与计算；空文本也有对应的哈希值。">
          <textarea
            rows={7}
            value={text}
            disabled={task.busy}
            onChange={(e) => {
              setText(e.target.value);
              clearResult();
            }}
            placeholder="输入需要计算哈希的文本…"
          />
        </Field>
      ) : (
        <>
          <FileDropzone
            disabled={task.busy}
            onFiles={(files) => {
              setFile(files[0] || null);
              clearResult();
            }}
            hint="任何格式 · 单个文件最大 500 MB · 后台分块计算"
          />
          {file && (
            <div className="file-list">
              <div className="file-row">
                <FileKey2 size={20} />
                <span>{file.name}</span>
                <small>{formatBytes(file.size)}</small>
                <button
                  className="icon-button"
                  aria-label="移除文件"
                  disabled={task.busy}
                  onClick={() => {
                    setFile(null);
                    clearResult();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={calculate}>
          <Fingerprint size={17} />
          计算 {algorithmNames[algorithm]}
        </ActionButton>
        {task.busy && mode === 'file' && (
          <button
            className="button button-secondary"
            onClick={() => {
              worker.current?.terminate();
              worker.current = null;
              rejectPending.current?.(new Error('已取消计算，文件未上传。'));
              rejectPending.current = null;
            }}
          >
            取消计算
          </button>
        )}
        <button
          className="button button-secondary"
          disabled={task.busy}
          onClick={() => {
            setText('');
            setFile(null);
            clearResult();
          }}
        >
          清空
        </button>
      </div>
      {task.busy && mode === 'file' && <Progress value={task.progress} label="正在本地分块计算" />}
      <ErrorNotice error={task.error} />
      {digest && (
        <ResultBox title={`${algorithmNames[algorithm]} 计算结果`}>
          <div className="hash-result">
            <code
              style={{
                display: 'block',
                overflowWrap: 'anywhere',
                fontSize: 15,
                lineHeight: 1.8,
                marginBottom: 18,
              }}
            >
              {output}
            </code>
            <div className="button-row">
              <CopyButton value={output} />
              <button
                className="button button-secondary"
                onClick={() => downloadText(output, `轻匣-${algorithm}.txt`)}
              >
                <Download size={16} />
                下载结果
              </button>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={upper}
                  onChange={(e) => setUpper(e.target.checked)}
                />
                大写字母
              </label>
            </div>
          </div>
        </ResultBox>
      )}
      <Notice>
        MD5 和 SHA-1
        仅适用于文件一致性检查等兼容场景，不适合密码保存或安全签名。文件内容始终留在你的设备中。
      </Notice>
    </div>
  );
}

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?',
};
export function RandomTool() {
  const task = useToolTask('random');
  const [mode, setMode] = useState<'uuid' | 'password' | 'string'>('uuid');
  const [length, setLength] = useState(20);
  const [count, setCount] = useState(5);
  const [sets, setSets] = useState({ lower: true, upper: true, digits: true, symbols: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState('');
  const generate = () =>
    task.run(() => {
      if (!Number.isInteger(count) || count < 1 || count > 200)
        throw new Error('批量数量应为 1～200 之间的整数。');
      let charset =
        mode === 'string' && custom
          ? custom
          : Object.entries(sets)
              .filter(([, enabled]) => enabled)
              .map(([key]) => CHARSETS[key as keyof typeof CHARSETS])
              .join('');
      if (excludeAmbiguous) charset = charset.replace(/[0O1Il|]/g, '');
      const output = Array.from({ length: count }, () =>
        mode === 'uuid' ? secureUuid() : secureRandomString(length, charset),
      );
      setResult(output.join('\n'));
    });
  return (
    <div className="tool-stack">
      <div className="controls-grid">
        <Field label="生成类型">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setResult('');
            }}
          >
            <option value="uuid">UUID v4</option>
            <option value="password">随机密码</option>
            <option value="string">随机字符串</option>
          </select>
        </Field>
        <Field label="批量数量" hint="每次最多生成 200 条。">
          <input
            type="number"
            min="1"
            max="200"
            value={count}
            onChange={(e) => {
              setCount(Number(e.target.value));
              setResult('');
            }}
          />
        </Field>
        {mode !== 'uuid' && (
          <Field label="每条长度">
            <input
              type="number"
              min="1"
              max="1024"
              value={length}
              onChange={(e) => {
                setLength(Number(e.target.value));
                setResult('');
              }}
            />
          </Field>
        )}
      </div>
      {mode !== 'uuid' && (
        <>
          <div className="field">
            <span className="field-label">选择字符集</span>
            <div className="checkbox-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              {(Object.keys(sets) as Array<keyof typeof sets>).map((key) => (
                <label className="checkbox-field" key={key}>
                  <input
                    type="checkbox"
                    checked={sets[key]}
                    onChange={(e) => {
                      setSets((current) => ({ ...current, [key]: e.target.checked }));
                      setResult('');
                    }}
                  />
                  {
                    {
                      lower: '小写字母 a–z',
                      upper: '大写字母 A–Z',
                      digits: '数字 0–9',
                      symbols: '特殊符号',
                    }[key]
                  }
                </label>
              ))}
            </div>
            <small>每一位均从所选字符中独立、安全随机抽取；不会强制每类字符都出现。</small>
          </div>
          {mode === 'string' && (
            <Field
              label="自定义字符集（可选）"
              hint="填写后替代上面的字符集；重复字符自动去重，最多 256 种字符。"
            >
              <input
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setResult('');
                }}
                placeholder="例如：ABCDEF0123456789"
                maxLength={512}
              />
            </Field>
          )}
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={excludeAmbiguous}
              onChange={(e) => {
                setExcludeAmbiguous(e.target.checked);
                setResult('');
              }}
            />
            排除容易混淆的字符（0 O 1 I l |）
          </label>
        </>
      )}
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={generate}>
          <RefreshCw size={17} />
          安全生成
        </ActionButton>
        <button
          className="button button-secondary"
          onClick={() => {
            setResult('');
            task.setError('');
          }}
        >
          清空结果
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result && (
        <ResultBox title={`已生成 ${result.split('\n').length} 条`}>
          <textarea
            aria-label="生成结果"
            className="code-input"
            rows={Math.min(12, result.split('\n').length + 1)}
            value={result}
            readOnly
            spellCheck={false}
          />
          <div className="button-row" style={{ marginTop: 16 }}>
            <CopyButton value={result} />
            <button
              className="button button-secondary"
              onClick={() =>
                downloadText(
                  result,
                  `轻匣-${mode === 'uuid' ? 'UUID' : mode === 'password' ? '随机密码' : '随机字符串'}.txt`,
                )
              }
            >
              <Download size={16} />
              下载 TXT
            </button>
          </div>
        </ResultBox>
      )}
      <Notice>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={16} />
          使用浏览器密码学安全随机数，避免取模偏差。生成结果不会上传或保存在网站历史中，请自行妥善保管。
        </span>
      </Notice>
    </div>
  );
}

export function ColorTool() {
  const task = useToolTask('color');
  const [input, setInput] = useState('#B9F97D');
  const [result, setResult] = useState<ParsedColor | null>(null);
  const convert = () => task.run(() => setResult(parseColor(input)));
  const pickerValue = (() => {
    try {
      return parseColor(input).hex.slice(0, 7);
    } catch {
      return '#b9f97d';
    }
  })();
  return (
    <div className="tool-stack">
      <div className="controls-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 100px' }}>
        <Field label="输入颜色" hint="支持 #RGB、#RRGGBB、带透明度 HEX、RGB(A) 与 HSL(A)。">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void convert();
            }}
            placeholder="#B9F97D / rgb(185, 249, 125) / hsl(91, 91%, 73%)"
            spellCheck={false}
          />
        </Field>
        <Field label="取色">
          <input
            type="color"
            value={pickerValue}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setResult(null);
            }}
            aria-label="选择颜色"
          />
        </Field>
      </div>
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={convert}>
          <Palette size={17} />
          转换颜色
          <ArrowRight size={15} />
        </ActionButton>
        <button
          className="button button-secondary"
          onClick={() => {
            setInput('');
            setResult(null);
            task.setError('');
          }}
        >
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result && (
        <ResultBox title="一种颜色，三种表达">
          <div className="color-result" style={{ display: 'grid', gap: 20 }}>
            <div
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                background: 'repeating-conic-gradient(#d7ddd7 0% 25%, #fff 0% 50%) 50% / 20px 20px',
              }}
            >
              <div
                aria-label={`颜色预览 ${result.hex}`}
                style={{ height: 150, backgroundColor: result.rgb }}
              />
            </div>
            <div className="result-list">
              {[
                ['HEX', result.hex],
                ['RGB', result.rgb],
                ['HSL', result.hsl],
              ].map(([name, value]) => (
                <div
                  className="file-row"
                  key={name}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}
                >
                  <span className="badge" style={{ minWidth: 42 }}>
                    {name}
                  </span>
                  <code style={{ flex: 1, overflowWrap: 'anywhere' }}>{value}</code>
                  <CopyButton value={value} />
                </div>
              ))}
            </div>
          </div>
        </ResultBox>
      )}
      <Notice>RGB 通道按 8 位取整，HSL 显示到小数点后两位；带透明度的颜色在棋盘背景上预览。</Notice>
    </div>
  );
}
