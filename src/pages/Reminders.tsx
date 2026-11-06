import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarClock, Check, Copy, Mail, RefreshCw } from 'lucide-react';
import { useMember } from '../components/MemberSession';
import {
  defaultReminderTemplate,
  reminderOptions,
  reminderTemplates,
  type Reminder,
  type ReminderState,
  type ReminderTemplate,
} from '../lib/reminder-templates';
import './reminders.css';

const invitationKey = 'qingxia:reminder-invitation';
const labels: Record<ReminderState, string> = {
  awaiting: '等收件人确认',
  queued: '待发送',
  sending: '正在发送',
  sent: '已交给邮件服务',
  failed: '发送失败',
  uncertain: '发送结果待确认',
  cancelled: '已取消',
  expired: '确认已过期',
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
function localStamp(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function request<T>(
  token: string,
  path = '',
  method = 'GET',
  data?: object,
  signal?: AbortSignal,
): Promise<T> {
  const result = await fetch('/api/reminders' + path, {
    method,
    signal,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok || !payload) throw new Error(payload?.error || '暂时无法连接提醒服务，请重试。');
  return payload as T;
}

function CardPreview({
  template,
  name,
  message,
}: {
  template: ReminderTemplate;
  name: string;
  message: string;
}) {
  const card = reminderTemplates[template];
  const art = <img src={'/reminder-art/' + template + '.svg'} alt="" width={960} height={480} />;
  return (
    <article
      className="mail-card"
      data-template={template}
      style={{ background: card.paper, color: card.ink }}
    >
      <div className="mail-card-envelope">
        <strong>轻匣来信</strong>
        <span style={{ color: card.accent }}>{card.name}</span>
      </div>
      {card.layout === 'cover' && art}
      <div className="mail-card-title" style={{ borderColor: card.accent }}>
        <span className="mail-card-stamp" style={{ color: card.accent }}>
          {card.mark}
        </span>
        <h2>{card.occasion}</h2>
      </div>
      {card.layout === 'folio' && art}
      <div className="mail-card-copy">
        <p className="mail-card-to">写给 {name.trim() || '你想念的人'}</p>
        <p className="mail-card-message">{message.trim() || card.placeholder}</p>
      </div>
      <div className="mail-card-foot" style={{ borderColor: card.accent, color: card.accent }}>
        {card.closing}
      </div>
    </article>
  );
}

function TemplatePicker({
  template,
  setTemplate,
  busy = false,
}: {
  template: ReminderTemplate;
  setTemplate: (key: ReminderTemplate) => void;
  busy?: boolean;
}) {
  return (
    <fieldset className="template-field">
      <legend>选一张贺卡</legend>
      <div className="template-options">
        {reminderOptions.map((key) => (
          <button
            type="button"
            className="template-choice"
            key={key}
            disabled={busy}
            aria-pressed={template === key}
            onClick={() => setTemplate(key)}
          >
            <img src={'/reminder-art/' + key + '.svg'} alt="" width={960} height={480} />
            <span>{reminderTemplates[key].category}</span>
            <strong>{reminderTemplates[key].name}</strong>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function Reminders() {
  const { session, ready } = useMember();
  const { hash, pathname, search } = useLocation();
  const [invitation, setInvitation] = useState('');
  const [template, setTemplate] = useState(defaultReminderTemplate);
  useEffect(() => {
    const token = /^#accept=([a-z\d_-]{43})$/i.exec(hash)?.[1];
    try {
      if (token) {
        sessionStorage.setItem(invitationKey, token);
        history.replaceState(history.state, '', pathname + search);
      }
      setInvitation(token || sessionStorage.getItem(invitationKey) || '');
    } catch {
      setInvitation(token || '');
    }
  }, [hash, pathname, search]);

  function clearInvitation() {
    try {
      sessionStorage.removeItem(invitationKey);
    } catch {
      /* Optional browser storage. */
    }
    history.replaceState(history.state, '', pathname + search);
    setInvitation('');
  }

  return (
    <section className="reminder-page">
      <header className="reminder-heading">
        <div>
          <h1>把祝福写在今天</h1>
          <p>相识纪念、道谢、庆祝好消息，或只是想问声好。先写好这封信，让轻匣在约定时间送出。</p>
        </div>
        <span className="reminder-heading-icon" aria-hidden="true">
          <CalendarClock size={36} strokeWidth={1.3} />
        </span>
      </header>
      {session ? (
        <ReminderDesk
          key={session.user.id}
          token={session.access_token}
          email={session.user.email || ''}
          invitation={invitation}
          clearInvitation={clearInvitation}
          template={template}
          setTemplate={setTemplate}
        />
      ) : (
        <div className="reminder-guest">
          <div className="reminder-guest-options">
            <h2>{invitation ? '你收到一张来信邀请' : '今天想写哪一封？'}</h2>
            {!invitation && <TemplatePicker template={template} setTemplate={setTemplate} />}
            <p>
              {invitation
                ? '用邀请所指定的收件邮箱登录，即可决定是否接收这封预约邮件。'
                : '登录后可选择贺卡、填写收件人和发送时间。发给他人时，收件人需要先确认。'}
            </p>
            {ready || typeof window === 'undefined' ? (
              <Link className="button button-primary" to="/account?next=%2Freminders">
                登录 / 注册
              </Link>
            ) : (
              <p role="status">正在检查登录状态…</p>
            )}
          </div>
          <CardPreview template={template} name="" message="" />
        </div>
      )}
    </section>
  );
}

function ReminderDesk({
  token,
  email,
  invitation,
  clearInvitation,
  template,
  setTemplate,
}: {
  token: string;
  email: string;
  invitation: string;
  clearInvitation: () => void;
  template: ReminderTemplate;
  setTemplate: (key: ReminderTemplate) => void;
}) {
  const [recipient, setRecipient] = useState(email);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [due, setDue] = useState(() => localStamp(new Date(Date.now() + 60 * 60_000)));
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const own = recipient.trim().toLowerCase() === email.toLowerCase();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '本机时区';

  useEffect(() => {
    const controller = new AbortController();
    void request<{ items: Reminder[] }>(token, '', 'GET', undefined, controller.signal)
      .then((data) => setItems(data.items))
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token, revision]);

  async function run<T>(fn: () => Promise<T>, apply: (data: T) => void) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      apply(await fn());
      setRevision((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作暂未完成。');
    } finally {
      setBusy(false);
    }
  }

  function schedule(event: FormEvent) {
    event.preventDefault();
    const timestamp = new Date(due);
    if (!Number.isFinite(timestamp.getTime()) || localStamp(timestamp) !== due) {
      setError('请选择一个有效的本地时间。');
      return;
    }
    setLink('');
    void run(
      () =>
        request<{ invite: string | null }>(token, '', 'POST', {
          recipient,
          name,
          message,
          template,
          due: timestamp.toISOString(),
        }),
      ({ invite }) => {
        setMessage('');
        if (invite) setLink(location.origin + invite);
        setNotice(invite ? '预约已保存。请把确认链接交给收件人。' : '预约已安排，到时由轻匣发出。');
      },
    );
  }

  function renew(id: string) {
    void run(
      () =>
        request<{ invite: string }>(token, '?action=renew&id=' + encodeURIComponent(id), 'POST'),
      ({ invite }) => {
        setLink(location.origin + invite);
        setNotice('已生成新的确认链接。');
      },
    );
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(link);
      setNotice('确认链接已复制。');
    } catch {
      setNotice('请选中链接后手动复制。');
    }
  }

  return (
    <>
      {invitation && (
        <section className="reminder-invite" aria-label="收件确认">
          <h2>确认接收这封预约邮件</h2>
          <p>仅指定的收件邮箱可以确认。确认后，轻匣会按发件人选择的时间发送这一封邮件。</p>
          <div className="button-row">
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => request(token, '?action=confirm', 'POST', { token: invitation }),
                  () => {
                    clearInvitation();
                    setNotice('已确认接收，轻匣会在预约时间发出。');
                  },
                )
              }
            >
              <Check size={17} /> 确认接收
            </button>
            <button className="button button-secondary" disabled={busy} onClick={clearInvitation}>
              关闭邀请
            </button>
          </div>
        </section>
      )}
      <div className="reminder-desk">
        <form className="community-form reminder-form" onSubmit={schedule}>
          <TemplatePicker template={template} setTemplate={setTemplate} busy={busy} />
          <div className="reminder-fields">
            <label>
              收件邮箱
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <label>
              收件人称呼
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="例如：给未来的我"
                required
                disabled={busy}
              />
            </label>
          </div>
          <label>
            贺卡正文
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={5}
              placeholder={reminderTemplates[template].placeholder}
              required
              disabled={busy}
            />
          </label>
          <span className="reminder-character-count">{message.length}/500</span>
          <a href="#card-preview" className="reminder-preview-jump">
            查看贺卡预览
          </a>
          <label>
            发送时间
            <input
              type="datetime-local"
              value={due}
              min={localStamp(new Date(Date.now() + 120_000))}
              onChange={(e) => setDue(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <p className="muted">时区 {timezone}。邮件按分钟安排，可能因队列或邮箱处理稍晚到达。</p>
          <p className="reminder-consent-note">
            {own ? '这封邮件将发给你自己。' : '收件人须通过你分享的链接确认，确认前邮件不会发出。'}
          </p>
          <button
            className="button button-primary"
            disabled={busy || !name.trim() || !message.trim()}
          >
            <Mail size={17} /> {busy ? '处理中…' : '预约发送'}
          </button>
        </form>
        <div className="reminder-preview" id="card-preview">
          <div className="reminder-preview-label">
            <strong>贺卡预览</strong>
            <span>{reminderTemplates[template].note}</span>
          </div>
          <CardPreview template={template} name={name} message={message} />
        </div>
      </div>
      {notice && (
        <p role="status" className="reminder-message">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="reminder-message community-error">
          {error}
        </p>
      )}
      {link && (
        <div className="community-form reminder-invite">
          <label>
            收件确认链接
            <input value={link} readOnly onFocus={(e) => e.target.select()} />
          </label>
          <button className="button button-secondary" onClick={() => void copyInvite()}>
            <Copy size={16} /> 复制确认链接
          </button>
        </div>
      )}
      <section className="reminder-history">
        <header>
          <h2>已安排的来信</h2>
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setRevision((value) => value + 1);
            }}
          >
            <RefreshCw size={16} /> 刷新状态
          </button>
        </header>
        {!items && !error && <p role="status">正在读取预约…</p>}
        {items?.length === 0 && <p className="muted">还没有预约。选一张卡片，给未来写封信。</p>}
        {items?.map((item) => (
          <article className="reminder-history-row" key={item.id}>
            <div>
              <strong>
                {item.recipient_name} · {reminderTemplates[item.template].name}
              </strong>
              <p>
                {item.recipient} · <time dateTime={item.due_at}>{formatDate(item.due_at)}</time>
              </p>
            </div>
            <span className={'reminder-state state-' + item.state}>{labels[item.state]}</span>
            <div className="button-row">
              {item.state === 'awaiting' && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => renew(item.id)}
                >
                  生成确认链接
                </button>
              )}
              {['awaiting', 'queued'].includes(item.state) && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('取消这封来信的预约？'))
                      void run(
                        () => request(token, '?id=' + encodeURIComponent(item.id), 'DELETE'),
                        () => {
                          setLink('');
                          setNotice('预约已取消。');
                        },
                      );
                  }}
                >
                  取消预约
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
