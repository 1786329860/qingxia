import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Download, ImagePlay, MessageSquarePlus, Pin, Trash2 } from 'lucide-react';
import { MemberGate, useMember } from '../components/MemberSession';
import {
  communityDate,
  communityRequest,
  stickerRequest,
  stickerUrl,
  type Note,
  type NoteList,
  type Sticker,
} from '../lib/community';

export function NoteCard({ note, children }: { note: Note; children?: ReactNode }) {
  return (
    <article className="sticky-note">
      <header>
        <Pin size={15} aria-hidden="true" />
        <strong>{note.display_name}</strong>
        <time dateTime={note.created_at}>{communityDate.format(new Date(note.created_at))}</time>
      </header>
      <p className="note-content">{note.content}</p>
      {note.reply && (
        <div className="note-reply">
          <strong>站长回复</strong>
          <p>{note.reply}</p>
        </div>
      )}
      {children}
    </article>
  );
}

export function Wall() {
  const { session } = useMember();
  return (
    <section className="community-page">
      <header className="community-intro">
        <h1>轻匣留言墙</h1>
        <p>哪件小事还可以更轻松？把你的建议、工具需求或表情包点子贴在这里。</p>
        <Link to="/gifs">
          去表情包区看看 <ImagePlay size={17} />
        </Link>
      </header>
      {session ? (
        <WallBoard key={session.user.id} token={session.access_token} />
      ) : (
        <MemberGate wall />
      )}
    </section>
  );
}

function WallBoard({ token }: { token: string }) {
  const [listing, setListing] = useState<NoteList | null>(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void communityRequest<NoteList>('kind=notes&page=' + page, { token, signal: controller.signal })
      .then(setListing)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, revision, token]);

  async function mutate(method: 'POST' | 'DELETE', id?: string, event?: FormEvent) {
    event?.preventDefault();
    if (busy || (method === 'DELETE' && !window.confirm('删除这张便利贴？'))) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await communityRequest('kind=notes' + (id ? '&id=' + id : ''), {
        method,
        token,
        payload: method === 'POST' ? { name, content } : undefined,
      });
      if (method === 'POST') setContent('');
      setPage(0);
      setRevision((value) => value + 1);
      setStatus(method === 'POST' ? '便利贴已贴上墙。' : '便利贴已删除。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="community-form wall-compose"
        onSubmit={(event) => void mutate('POST', undefined, event)}
      >
        <h2>
          <MessageSquarePlus size={20} /> 写张便利贴
        </h2>
        <label>
          公开昵称
          <input
            value={name}
            maxLength={24}
            required
            onChange={(e) => setName(e.target.value)}
            placeholder="给自己取个名字"
          />
        </label>
        <label>
          留言
          <textarea
            value={content}
            maxLength={500}
            required
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="想建议什么？"
          />
        </label>
        <div className="compose-foot">
          <p>
            墙上会显示昵称和留言。请勿填写邮箱、手机号等个人信息。 <span>{content.length}/500</span>
          </p>
          <button
            className="button button-primary"
            disabled={busy || !content.trim() || !name.trim()}
          >
            贴上留言墙
          </button>
        </div>
      </form>
      {status && <p role="status">{status}</p>}
      {error && (
        <p className="community-error" role="alert">
          {error}{' '}
          <button
            className="button button-secondary"
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            刷新留言
          </button>
        </p>
      )}
      <div className="wall-board">
        <h2>墙上的便利贴</h2>
        {!listing && !error && <p role="status">正在读取留言…</p>}
        {listing && !listing.items.length && <p>这里还空着，欢迎贴上第一张便利贴。</p>}
        <div className="note-grid">
          {listing?.items.map((note) => (
            <NoteCard key={note.id} note={note}>
              {note.own && (
                <button
                  className="note-delete"
                  disabled={busy}
                  onClick={() => void mutate('DELETE', note.id)}
                >
                  <Trash2 size={15} /> 删除我的留言
                </button>
              )}
            </NoteCard>
          ))}
        </div>
        <div className="community-actions">
          {page > 0 && (
            <button disabled={busy} onClick={() => setPage(page - 1)}>
              上一页
            </button>
          )}
          {listing?.more && (
            <button disabled={busy} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function Gallery() {
  const [items, setItems] = useState<Sticker[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState(
    () =>
      typeof window !== 'undefined' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const controller = new AbortController();
    void communityRequest<{ items: Sticker[] }>('kind=gifs', { signal: controller.signal })
      .then((data) => setItems(data.items))
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [revision]);

  return (
    <section className="community-page">
      <header className="community-intro gallery-intro">
        <h1>GIF 表情包</h1>
        <p>{stickerRequest}</p>
        <Link to="/wall">
          <MessageSquarePlus size={17} /> 到留言墙许愿
        </Link>
      </header>
      {error && (
        <p className="community-error" role="alert">
          {error}{' '}
          <button
            className="button button-secondary"
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            重试
          </button>
        </p>
      )}
      {!items && !error && <p role="status">正在翻找表情包…</p>}
      {items && !items.length && (
        <div className="gallery-empty">
          <ImagePlay size={30} aria-hidden="true" />
          <h2>表情包架还空着</h2>
          <p>等站长上传新作品后，就可以来这里下载。</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="community-actions">
          <button className="button button-secondary" onClick={() => setPreview(!preview)}>
            {preview ? '暂停动图预览' : '播放动图预览'}
          </button>
        </div>
      )}
      <div className="sticker-grid">
        {items?.map((item) => (
          <article className="sticker" key={item.id}>
            <div className="sticker-preview">
              {preview ? (
                <img src={stickerUrl(item.id)} alt={item.title} loading="lazy" decoding="async" />
              ) : (
                <ImagePlay size={30} aria-hidden="true" />
              )}
            </div>
            <div className="sticker-info">
              <h2>{item.title}</h2>
              <a
                className="button button-secondary"
                href={stickerUrl(item.id, true)}
                aria-label={'下载 ' + item.title}
              >
                <Download size={16} /> 下载 GIF
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
