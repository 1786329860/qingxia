import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlay, MessagesSquare, Upload } from 'lucide-react';
import { NoteCard } from './Community';
import { communityRequest, stickerUrl, type NoteList, type Sticker } from '../lib/community';

const MAX_BYTES = 2 * 1024 * 1024;
const query = (kind: 'notes' | 'gifs') => 'manage=1&kind=' + kind;

async function encodeFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  for (let i = 0; i < bytes.length; i += 16384)
    raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(raw);
}

export default function CommunityAdmin() {
  const [panel, setPanel] = useState<'notes' | 'gifs'>('notes');
  return (
    <section className="chart-card community-admin">
      <h2>社区管理</h2>
      <div className="community-actions">
        <button
          type="button"
          className={'button ' + (panel === 'notes' ? 'button-primary' : 'button-secondary')}
          aria-pressed={panel === 'notes'}
          onClick={() => setPanel('notes')}
        >
          <MessagesSquare size={17} /> 留言管理
        </button>
        <button
          type="button"
          className={'button ' + (panel === 'gifs' ? 'button-primary' : 'button-secondary')}
          aria-pressed={panel === 'gifs'}
          onClick={() => setPanel('gifs')}
        >
          <ImagePlay size={17} /> GIF 管理
        </button>
      </div>
      {panel === 'notes' ? <ManageNotes /> : <ManageGifs />}
    </section>
  );
}

function useManagement<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);
  function reload() {
    setVersion((value) => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    void communityRequest<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [path, version]);
  async function run(operation: () => Promise<unknown>, message: string) {
    if (pending) return false;
    setPending(true);
    setError('');
    setStatus('');
    try {
      await operation();
      setStatus(message);
      reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试');
      return false;
    } finally {
      setPending(false);
    }
  }
  return { data, error, status, pending, run, reload };
}

function ManageNotes() {
  const [page, setPage] = useState(0);
  const path = query('notes') + '&page=' + page;
  const state = useManagement<NoteList>(path);
  return (
    <>
      {state.error && (
        <p className="community-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status && <p role="status">{state.status}</p>}
      {!state.data && !state.error && <p role="status">正在读取留言…</p>}
      {state.data && !state.data.items.length && <p>此页没有留言。</p>}
      <div className="note-grid">
        {state.data?.items.map((note) => (
          <NoteCard key={note.id + (note.reply || '')} note={note}>
            <form
              className="community-form"
              onSubmit={(event) => {
                event.preventDefault();
                const reply = String(new FormData(event.currentTarget).get('reply') || '');
                void state.run(
                  () =>
                    communityRequest(path + '&id=' + note.id, {
                      method: 'PATCH',
                      payload: { reply },
                    }),
                  '站长回复已保存',
                );
              }}
            >
              <label>
                站长回复
                <textarea
                  name="reply"
                  required
                  maxLength={500}
                  rows={2}
                  defaultValue={note.reply || ''}
                />
              </label>
              <div className="community-actions">
                <button className="note-delete" disabled={state.pending}>
                  保存回复
                </button>
                <button
                  className="note-delete"
                  type="button"
                  disabled={state.pending}
                  onClick={() => {
                    if (window.confirm('删除这条留言及其回复？'))
                      void state.run(
                        () => communityRequest(path + '&id=' + note.id, { method: 'DELETE' }),
                        '留言已删除',
                      );
                  }}
                >
                  删除留言
                </button>
              </div>
            </form>
          </NoteCard>
        ))}
      </div>
      <div className="community-actions">
        {page > 0 && <button onClick={() => setPage(page - 1)}>上一页</button>}
        {state.data?.more && <button onClick={() => setPage(page + 1)}>下一页</button>}
        <button onClick={state.reload}>刷新</button>
      </div>
    </>
  );
}

function ManageGifs() {
  const path = query('gifs');
  const state = useManagement<{ items: Sticker[] }>(path);
  const form = useRef<HTMLFormElement>(null);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('gif');
    const title = String(data.get('title') || '').trim();
    if (
      await state.run(async () => {
        if (!(file instanceof File) || !file.size || file.size > MAX_BYTES)
          throw new Error('请选择一个不超过 2 MB 的 GIF 文件');
        if (!title) throw new Error('请填写表情包名称');
        await communityRequest(path, {
          method: 'POST',
          payload: { title, gif: await encodeFile(file) },
        });
      }, '表情包已发布')
    )
      form.current?.reset();
  }
  return (
    <>
      <form
        className="community-form gif-upload"
        ref={form}
        onSubmit={(event) => void upload(event)}
      >
        <label>
          表情包名称
          <input name="title" maxLength={60} required />
        </label>
        <label>
          GIF 文件（最多 2 MB）
          <input type="file" name="gif" accept=".gif,image/gif" required />
        </label>
        <button className="button button-primary" disabled={state.pending}>
          <Upload size={17} /> {state.pending ? '处理中…' : '上传并发布'}
        </button>
      </form>
      {state.error && (
        <p className="community-error" role="alert">
          {state.error}
        </p>
      )}
      {state.status && <p role="status">{state.status}</p>}
      {!state.data && !state.error && <p role="status">正在读取表情包…</p>}
      {state.data && !state.data.items.length && <p>尚未上传表情包。</p>}
      <ul className="gif-admin-list">
        {state.data?.items.map((item) => (
          <li key={item.id}>
            {item.published && <img src={stickerUrl(item.id)} alt="" loading="lazy" />}
            <strong>{item.title}</strong>
            {!item.published && <span>未发布</span>}
            <button
              className="button button-secondary"
              disabled={state.pending}
              onClick={() => {
                if (window.confirm('从表情包区删除这张 GIF？'))
                  void state.run(
                    () => communityRequest(path + '&id=' + item.id, { method: 'DELETE' }),
                    '表情包已删除',
                  );
              }}
            >
              删除 GIF
            </button>
          </li>
        ))}
      </ul>
      <button className="button button-secondary" onClick={state.reload}>
        刷新列表
      </button>
    </>
  );
}
