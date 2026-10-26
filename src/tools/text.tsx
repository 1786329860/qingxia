import { useState } from 'react';
import { Braces, Download, Eraser, FileCode2, ArrowRightLeft } from 'lucide-react';
import {
  ActionButton,
  CopyButton,
  ErrorNotice,
  Field,
  FileDropzone,
  Notice,
  ResultBox,
  useToolTask,
} from '../components/ToolUI';
import { checkFileSize, downloadBlob, downloadText, formatBytes } from '../lib/files';
import {
  base64ToBytes,
  bytesToBase64,
  csvToJson,
  jsonErrorMessage,
  jsonToCsv,
  processLines,
  validateText,
} from '../lib/text-convert';

const PREVIEW_LIMIT = 150000;
function TextResult({
  value,
  name = '轻匣-处理结果.txt',
  type = 'text/plain;charset=utf-8',
}: {
  value: string;
  name?: string;
  type?: string;
}) {
  return (
    <ResultBox>
      <div className="button-row">
        <CopyButton value={value} />
        <button className="button button-secondary" onClick={() => downloadText(value, name, type)}>
          <Download size={16} />
          下载结果
        </button>
        <span className="muted">{value.length.toLocaleString()} 个字符</span>
      </div>
      <textarea
        aria-label="处理结果"
        className="code-input result-text"
        rows={12}
        value={value.slice(0, PREVIEW_LIMIT)}
        readOnly
        spellCheck={false}
      />
      {value.length > PREVIEW_LIMIT && (
        <Notice>
          为保持流畅，仅预览前 {PREVIEW_LIMIT.toLocaleString()} 个字符；复制和下载包含完整结果。
        </Notice>
      )}
    </ResultBox>
  );
}

export function JsonTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [indent, setIndent] = useState('2');
  const task = useToolTask('json');
  const process = (compress: boolean) =>
    task.run(() => {
      validateText(input);
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch (error) {
        throw new Error(jsonErrorMessage(input, error));
      }
      setResult(
        JSON.stringify(
          parsed,
          null,
          compress ? undefined : indent === 'tab' ? '\t' : Number(indent),
        ),
      );
    });
  return (
    <div className="tool-workspace">
      <Field label="JSON 内容" hint="支持标准 JSON；不支持注释、单引号或末尾逗号。最多 5 MB 字符。">
        <textarea
          className="code-input"
          rows={14}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setResult(null);
            task.setError('');
          }}
          placeholder={
            '{\n  "message": "把日常小事，轻轻解决",\n  "tools": ["图片", "PDF", "文本"]\n}'
          }
          spellCheck={false}
        />
      </Field>
      <div className="controls-grid">
        <Field label="缩进">
          <select value={indent} onChange={(event) => setIndent(event.target.value)}>
            <option value="2">2 个空格</option>
            <option value="4">4 个空格</option>
            <option value="tab">Tab 制表符</option>
          </select>
        </Field>
      </div>
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={() => process(false)}>
          <Braces size={17} />
          格式化 / 校验
        </ActionButton>
        <button
          className="button button-secondary"
          disabled={task.busy}
          onClick={() => process(true)}
        >
          压缩 JSON
        </button>
        <button
          className="button button-ghost"
          onClick={() => {
            setInput('');
            setResult(null);
            task.setError('');
          }}
        >
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      <Notice>
        使用浏览器标准 JSON 数值规则。超过 JavaScript
        安全整数范围的编号，请在输入中用双引号包裹，避免精度丢失。
      </Notice>
      {result !== null && (
        <>
          <Notice tone="success">校验通过，JSON 语法正确。</Notice>
          <TextResult
            value={result}
            name="轻匣-格式化.json"
            type="application/json;charset=utf-8"
          />
        </>
      )}
    </div>
  );
}

type Base64Mode = 'encode' | 'decode' | 'file-encode' | 'file-decode';
export function Base64Tool() {
  const [mode, setMode] = useState<Base64Mode>('encode');
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('decoded.bin');
  const [dataUri, setDataUri] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [binary, setBinary] = useState<Blob | null>(null);
  const task = useToolTask('base64');
  const resetResult = () => {
    setResult(null);
    setBinary(null);
    task.setError('');
  };
  const process = () =>
    task.run(async () => {
      setResult(null);
      setBinary(null);
      if (mode === 'file-encode') {
        if (!file) throw new Error('请先选择需要编码的文件。');
        checkFileSize(file, 50);
        const encoded = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
        setResult(
          dataUri ? `data:${file.type || 'application/octet-stream'};base64,${encoded}` : encoded,
        );
      } else if (mode === 'encode') {
        validateText(input, true);
        setResult(bytesToBase64(new TextEncoder().encode(input)));
      } else {
        if (!input.trim()) throw new Error('请先输入 Base64 内容。');
        const decoded = base64ToBytes(input);
        if (mode === 'file-decode') {
          if (!filename.trim() || /[\\/\x00-\x1F]/.test(filename))
            throw new Error('请输入有效文件名，不能包含路径分隔符或控制字符。');
          setBinary(new Blob([decoded.bytes], { type: decoded.mime }));
        } else {
          try {
            setResult(new TextDecoder('utf-8', { fatal: true }).decode(decoded.bytes));
          } catch {
            throw new Error(
              '解码内容不是有效的 UTF-8 文本。请切换到「Base64 转文件」保存二进制内容。',
            );
          }
        }
      }
    });
  return (
    <div className="tool-workspace">
      <Field label="处理方式">
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as Base64Mode);
            resetResult();
          }}
        >
          <option value="encode">文本 → Base64</option>
          <option value="decode">Base64 → 文本</option>
          <option value="file-encode">文件 → Base64</option>
          <option value="file-decode">Base64 → 文件</option>
        </select>
      </Field>
      {mode === 'file-encode' ? (
        <>
          <FileDropzone
            onFiles={(files) => {
              setFile(files[0] || null);
              resetResult();
            }}
            hint="任意文件 · 最大 50 MB · 完全本地处理"
          />
          {file && (
            <div className="file-list">
              <FileCode2 size={18} />
              <span>{file.name}</span>
              <span className="muted">{formatBytes(file.size)}</span>
            </div>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={dataUri}
              onChange={(event) => {
                setDataUri(event.target.checked);
                resetResult();
              }}
            />
            包含 data: MIME 前缀
          </label>
        </>
      ) : (
        <Field
          label={mode === 'encode' ? '原始文本（UTF-8）' : 'Base64 内容'}
          hint={
            mode === 'encode'
              ? '中文、Emoji 均按 UTF-8 编码。'
              : '支持带换行的标准 Base64，以及 data:…;base64 内容。'
          }
        >
          <textarea
            className="code-input"
            rows={12}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              resetResult();
            }}
            placeholder={mode === 'encode' ? '你好，轻匣 👋' : '粘贴 Base64 内容…'}
            spellCheck={false}
          />
        </Field>
      )}
      {mode === 'file-decode' && (
        <Field
          label="下载文件名"
          hint="请按原始文件类型填写扩展名。工具只生成下载，不会自动打开文件。"
        >
          <input
            value={filename}
            onChange={(event) => {
              setFilename(event.target.value);
              resetResult();
            }}
            placeholder="decoded.bin"
          />
        </Field>
      )}
      <div className="button-row">
        <ActionButton busy={task.busy} onClick={process}>
          <ArrowRightLeft size={16} />
          {mode.endsWith('encode') ? '开始编码' : '开始解码'}
        </ActionButton>
        <button
          className="button button-ghost"
          onClick={() => {
            setInput('');
            setFile(null);
            resetResult();
          }}
        >
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result !== null && (
        <TextResult
          value={result}
          name={mode.endsWith('encode') ? '轻匣-base64.txt' : '轻匣-解码.txt'}
        />
      )}
      {binary && (
        <ResultBox>
          <p>解码完成 · {formatBytes(binary.size)}</p>
          <button
            className="button button-primary"
            onClick={() => downloadBlob(binary, filename.trim())}
          >
            <Download size={16} />
            下载 {filename}
          </button>
        </ResultBox>
      )}
    </div>
  );
}

export function TextLinesTool() {
  const [input, setInput] = useState('');
  const [trim, setTrim] = useState(true);
  const [empty, setEmpty] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [sort, setSort] = useState<'none' | 'asc' | 'desc'>('none');
  const [result, setResult] = useState<string | null>(null);
  const task = useToolTask('text-lines');
  const invalidate = () => {
    setResult(null);
    task.setError('');
  };
  return (
    <div className="tool-workspace">
      <Field label="待处理文本" hint="每行作为一项；最多 100,000 行、5 MB 字符。">
        <textarea
          rows={13}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            invalidate();
          }}
          placeholder={'苹果\n香蕉\n苹果\n\n  西瓜  '}
          spellCheck={false}
        />
      </Field>
      <div className="controls-grid">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={dedupe}
            onChange={(event) => {
              setDedupe(event.target.checked);
              invalidate();
            }}
          />
          去除重复行
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={empty}
            onChange={(event) => {
              setEmpty(event.target.checked);
              invalidate();
            }}
          />
          去除空行
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={trim}
            onChange={(event) => {
              setTrim(event.target.checked);
              invalidate();
            }}
          />
          去除首尾空格
        </label>
        <Field label="排序方式">
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as typeof sort);
              invalidate();
            }}
          >
            <option value="none">保留原始顺序</option>
            <option value="asc">升序（中文 / 数字自然排序）</option>
            <option value="desc">降序（中文 / 数字自然排序）</option>
          </select>
        </Field>
      </div>
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          onClick={() =>
            task.run(() => {
              if (!input.length) throw new Error('请先输入需要处理的文本。');
              setResult(processLines(input, { trim, empty, dedupe, sort }));
            })
          }
        >
          处理文本
        </ActionButton>
        <button
          className="button button-ghost"
          onClick={() => {
            setInput('');
            invalidate();
          }}
        >
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result !== null && (
        <>
          <Notice tone="success">
            已处理 {input.split(/\r\n|\r|\n/).length.toLocaleString()} 行，结果保留{' '}
            {result ? result.split('\n').length.toLocaleString() : 0} 行。去重区分大小写。
          </Notice>
          <TextResult value={result} />
        </>
      )}
    </div>
  );
}

export function CsvJsonTool() {
  const [mode, setMode] = useState<'csv-json' | 'json-csv'>('csv-json');
  const [input, setInput] = useState('');
  const [header, setHeader] = useState(true);
  const [delimiter, setDelimiter] = useState('');
  const [safe, setSafe] = useState(true);
  const [bom, setBom] = useState(true);
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const task = useToolTask('csv-json');
  const invalidate = () => {
    setResult(null);
    task.setError('');
  };
  return (
    <div className="tool-workspace">
      <div className="controls-grid">
        <Field label="转换方向">
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as typeof mode);
              invalidate();
            }}
          >
            <option value="csv-json">CSV → JSON</option>
            <option value="json-csv">JSON → CSV</option>
          </select>
        </Field>
        <Field label="字段分隔符">
          <select
            value={delimiter}
            onChange={(event) => {
              setDelimiter(event.target.value);
              invalidate();
            }}
          >
            <option value="">{mode === 'csv-json' ? '自动识别' : '默认逗号'}</option>
            <option value=",">逗号 ,</option>
            <option value=";">分号 ;</option>
            <option value={'\t'}>Tab 制表符</option>
          </select>
        </Field>
      </div>
      <Field
        label={mode === 'csv-json' ? 'CSV 内容' : 'JSON 数组'}
        hint={
          mode === 'csv-json'
            ? '支持引号、引号内换行和转义双引号。'
            : '支持对象数组或二维数组；对象列名会取所有行字段的合集。'
        }
      >
        <textarea
          className="code-input"
          rows={13}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            invalidate();
          }}
          placeholder={
            mode === 'csv-json'
              ? '姓名,城市,分数\n小匣,杭州,95\n小轻,上海,98'
              : '[{"姓名":"小匣","城市":"杭州","分数":95}]'
          }
          spellCheck={false}
        />
      </Field>
      <div className="controls-grid">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={header}
            onChange={(event) => {
              setHeader(event.target.checked);
              invalidate();
            }}
          />
          {mode === 'csv-json' ? '首行为列名' : '对象数组包含列名行'}
        </label>
        {mode === 'csv-json' ? (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={skipEmpty}
              onChange={(event) => {
                setSkipEmpty(event.target.checked);
                invalidate();
              }}
            />
            忽略空白行
          </label>
        ) : (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={safe}
                onChange={(event) => {
                  setSafe(event.target.checked);
                  invalidate();
                }}
              />
              防止表格公式注入
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bom}
                onChange={(event) => setBom(event.target.checked)}
              />
              下载时添加 UTF-8 BOM（适配 Excel）
            </label>
          </>
        )}
      </div>
      {mode === 'json-csv' && (
        <Notice>
          安全模式会为以 =、+、-、@
          等开头的文本字段添加单引号，防止表格软件当作公式执行。数值字段不受影响。
        </Notice>
      )}
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          onClick={() =>
            task.run(() =>
              setResult(
                mode === 'csv-json'
                  ? csvToJson(input, { header, delimiter, skipEmpty })
                  : jsonToCsv(input, { header, delimiter: delimiter || ',', safe }),
              ),
            )
          }
        >
          <ArrowRightLeft size={16} />
          开始转换
        </ActionButton>
        <button
          className="button button-ghost"
          onClick={() => {
            setInput('');
            invalidate();
          }}
        >
          <Eraser size={16} />
          清空
        </button>
      </div>
      <ErrorNotice error={task.error} />
      {result !== null && (
        <ResultBox>
          <div className="button-row">
            <CopyButton value={result} />
            <button
              className="button button-secondary"
              onClick={() =>
                downloadText(
                  `${mode === 'json-csv' && bom ? '\uFEFF' : ''}${result}`,
                  mode === 'csv-json' ? '轻匣-转换.json' : '轻匣-转换.csv',
                  mode === 'csv-json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
                )
              }
            >
              <Download size={16} />
              下载 {mode === 'csv-json' ? 'JSON' : 'CSV'}
            </button>
          </div>
          <textarea
            className="code-input result-text"
            rows={12}
            value={result.slice(0, PREVIEW_LIMIT)}
            readOnly
            aria-label="转换结果"
            spellCheck={false}
          />
          {result.length > PREVIEW_LIMIT && (
            <Notice>
              预览已截取前 {PREVIEW_LIMIT.toLocaleString()} 个字符，下载包含完整结果。
            </Notice>
          )}
        </ResultBox>
      )}
    </div>
  );
}
