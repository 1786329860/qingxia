import { useState, type FormEvent } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ActionButton, ErrorNotice, Field, Notice, ResultBox } from '../components/ToolUI';
import { trackToolUse } from '../lib/analytics';

function sunoShareURL(text: string) {
  const links = text.match(/https:\/\/[^\s<>"'，。；！？、）】]+/gi) || [];
  for (const link of links) {
    try {
      const url = new URL(link.replace(/[),.!;]+$/, ''));
      if (
        ['suno.com', 'www.suno.com'].includes(url.hostname) &&
        !url.port &&
        !url.username &&
        !url.password &&
        /^\/(?:song|s)\/[a-z\d_-]{4,180}\/?$/i.test(url.pathname)
      )
        return 'https://suno.com' + url.pathname.replace(/\/$/, '');
    } catch {
      // Try the next URL in the pasted share text.
    }
  }
  return '';
}

export default function SunoDownloadTool() {
  const [input, setInput] = useState('');
  const [url, setURL] = useState('');
  const [error, setError] = useState('');
  function prepare(event: FormEvent) {
    event.preventDefault();
    const next = sunoShareURL(input);
    setURL(next);
    setError(next ? '' : '请粘贴 Suno 的单首歌曲分享链接，支持 suno.com/song/… 和 suno.com/s/…');
    trackToolUse('suno-download', next ? 'success' : 'error');
  }
  return (
    <div className="tool-workspace">
      <Notice>
        粘贴 Suno 分享链接，打开官方作品页。下载权限、格式和额度由 Suno 账号决定。
        已保存的音频可以用轻匣在本机转成其他格式。
      </Notice>
      <form className="tool-form" onSubmit={prepare}>
        <Field label="Suno 分享链接或文案" hint="链接只在当前浏览器提取">
          <textarea
            value={input}
            rows={3}
            maxLength={4000}
            placeholder="https://suno.com/s/…"
            onChange={(event) => {
              setInput(event.target.value);
              setURL('');
              setError('');
            }}
          />
        </Field>
        <ActionButton type="submit" disabled={!input.trim()}>
          <Link2 size={17} /> 提取作品链接
        </ActionButton>
      </form>
      <ErrorNotice error={error} />
      {url && (
        <ResultBox title="Suno 官方作品入口">
          <p>
            在 Suno 登录后，从资料库找到有权限的歌曲，点「⋯ →
            Download」下载。若这是别人分享的歌，可请创作者提供可下载的音频文件。
          </p>
          <div className="button-row">
            <a className="button button-primary" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={17} /> 打开 Suno 作品
            </a>
            <a
              className="button button-secondary"
              href="https://suno.com/me"
              target="_blank"
              rel="noreferrer"
            >
              打开我的 Suno 资料库
            </a>
          </div>
        </ResultBox>
      )}
      <Link to="/tool/audio-convert">已保存音频？去本地转换格式</Link>
    </div>
  );
}
