import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useMember } from '../components/MemberSession';
import { downloadBlob } from '../lib/files';
import {
  GAODAOXIANG_BYTES,
  GAODAOXIANG_FILENAME,
  GAODAOXIANG_PART_BYTES,
  GAODAOXIANG_SHA256,
  GAODAOXIANG_VERSION,
} from '../lib/gaodaoxiang';

export default function GaodaoXiang() {
  const { session, ready } = useMember();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const transfer = useRef<AbortController | null>(null);
  useEffect(() => () => transfer.current?.abort(), []);

  async function download() {
    if (!session || transfer.current) return;
    const controller = new AbortController();
    transfer.current = controller;
    setBusy(true);
    setStatus('正在下载安装包…');
    try {
      const { supabaseClient } = await import('../lib/supabase-auth');
      const count = Math.ceil(GAODAOXIANG_BYTES / GAODAOXIANG_PART_BYTES);
      const parts: Blob[] = new Array(count);
      let next = 0;
      let received = 0;
      async function loadParts() {
        while (!controller.signal.aborted && next < count) {
          const index = next++;
          const expected = Math.min(
            GAODAOXIANG_PART_BYTES,
            GAODAOXIANG_BYTES - index * GAODAOXIANG_PART_BYTES,
          );
          for (let attempt = 0; attempt < 2; attempt++) {
            const { data, error, response } = await supabaseClient.functions.invoke<Blob>(
              `gaodaoxiang-download?part=${index}`,
              { method: 'GET', timeout: 75000, signal: controller.signal },
            );
            if (controller.signal.aborted) return;
            if (!error && data instanceof Blob && data.size === expected) {
              parts[index] = data;
              received += data.size;
              setStatus(`正在下载安装包… ${Math.floor((received / GAODAOXIANG_BYTES) * 100)}%`);
              break;
            }
            if (attempt || (response && response.status >= 400 && response.status < 500))
              throw new Error('Installer part unavailable');
          }
        }
      }
      await Promise.all(Array.from({ length: 3 }, loadParts));
      if (controller.signal.aborted) return;
      const file = new Blob(parts, { type: 'application/octet-stream' });
      if (file.size !== GAODAOXIANG_BYTES) throw new Error('Installer incomplete');
      downloadBlob(file, GAODAOXIANG_FILENAME);
      setStatus('安装包已准备好，请查看浏览器的下载记录。');
    } catch {
      if (!controller.signal.aborted) setStatus('安装包未能完整下载。请确认仍已登录，稍后再试。');
    } finally {
      const cancelled = controller.signal.aborted;
      controller.abort();
      transfer.current = null;
      if (!cancelled) setBusy(false);
    }
  }

  return (
    <article className="prose-page">
      <div className="page-kicker">公众号创作工具</div>
      <h1>稿到箱</h1>
      <p className="page-lead">把 AI 写好的文章，按时送进指定公众号的微信草稿箱。</p>
      <p>稿到箱为公众号创作者保留稿件的基本排版、封面和配图，省去反复复制粘贴、重新排版的麻烦。</p>
      <section aria-label="安装包">
        {session ? (
          <button className="button button-primary" disabled={busy} onClick={download}>
            <Download size={18} aria-hidden="true" />
            下载 Windows 安装包
          </button>
        ) : ready || typeof window === 'undefined' ? (
          <Link className="button button-primary" to="/account?next=%2Fgaodaoxiang">
            登录后下载
          </Link>
        ) : (
          <p role="status">正在检查登录状态…</p>
        )}
        {session && status && <p role="status">{status}</p>}
        <p>版本 {GAODAOXIANG_VERSION} · Windows 10 或更新版本（x64） · 32.6 MB</p>
        <p>此版本未做数字签名。Windows 可能显示未知发布者提示。</p>
        <details>
          <summary>查看 SHA-256 校验值</summary>
          <p>
            <code style={{ overflowWrap: 'anywhere' }}>{GAODAOXIANG_SHA256}</code>
          </p>
        </details>
      </section>
      <section>
        <h2>从稿件到微信草稿箱</h2>
        <ol>
          <li>安装并打开稿到箱，按应用内教程连接公众号。</li>
          <li>
            提交文章、封面和配图，选好目标公众号与送稿时间。定时送稿时，电脑需保持开机联网，稿到箱需保持运行。
          </li>
          <li>稿件送达后，在手机的「公众号助手」预览并确认，再手动发表。</li>
        </ol>
      </section>
      <Link className="button button-secondary" to="/">
        <ArrowLeft size={16} aria-hidden="true" />
        返回轻匣
      </Link>
    </article>
  );
}
