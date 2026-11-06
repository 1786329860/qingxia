import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { memberAuth, useMember } from '../components/MemberSession';

type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'recover' | 'reset';
type RecoveryClient = ReturnType<typeof import('../lib/supabase-auth').recoveryClient>;

const headings: Record<Mode, string> = {
  login: '登录轻匣',
  signup: '创建免费账号',
  confirm: '验证你的邮箱',
  forgot: '找回密码',
  recover: '输入找回验证码',
  reset: '设置新密码',
};

const subtitles: Record<Mode, string> = {
  login: '用注册时的邮箱和密码登录，即可免费使用工具。',
  signup: '用邮箱注册。验证成功后就可以使用工具和留言墙。',
  confirm: '请输入注册邮件里的验证码。如果还没收到，可以重新发送。',
  forgot: '输入你注册时使用的邮箱，我们会发送一次性找回验证码。',
  recover: '输入邮件里的验证码，验证成功后就可以重设密码。',
  reset: '新密码至少 10 位。保存后请用新密码登录。',
};

function errorText(error: AuthError) {
  switch (error.code) {
    case 'invalid_credentials':
      return '邮箱或密码不正确';
    case 'email_not_confirmed':
      return '邮箱尚未验证，请使用注册邮件里的验证码';
    case 'otp_expired':
      return '验证码不正确或已过期，请重新发送';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return '请求太频繁，请稍后再试';
    case 'weak_password':
      return '密码强度不足，请使用至少 10 位，混合字母、数字和符号';
    default:
      return '操作暂未完成，请检查网络和输入后重试';
  }
}

export default function Account() {
  const { session, ready } = useMember();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const passcardRef = useRef<HTMLDivElement>(null);
  const next = search.get('next') || '/';
  const destination = /^(?:\/(?:wall|reminders)|\/tool\/[a-z-]+)$/.test(next) ? next : '/';
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<RecoveryClient | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void memberAuth()
      .then(() => window.dispatchEvent(new Event('qingxia:account')))
      .catch(() => {});
  }, []);

  function go(nextMode: Mode) {
    setMode(nextMode);
    setError('');
    setStatus('');
    setPassword('');
    setCode('');
  }

  const handleCardMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const card = passcardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -7;
    const ry = ((x - rect.width / 2) / (rect.width / 2)) * 7;
    card.style.setProperty('--pass-rx', `${rx.toFixed(2)}deg`);
    card.style.setProperty('--pass-ry', `${ry.toFixed(2)}deg`);
    card.style.setProperty('--pass-x', `${((x / rect.width) * 100).toFixed(1)}%`);
    card.style.setProperty('--pass-y', `${((y / rect.height) * 100).toFixed(1)}%`);
  };

  const handleCardLeave = () => {
    const card = passcardRef.current;
    if (!card) return;
    card.style.setProperty('--pass-rx', '0deg');
    card.style.setProperty('--pass-ry', '0deg');
  };

  async function submit(event?: FormEvent, resend = false) {
    event?.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const auth = await memberAuth();
      const address = email.trim().toLowerCase();
      let result;
      switch (mode) {
        case 'login':
          result = await auth.signInWithPassword({ email: address, password });
          if (result.error?.code === 'email_not_confirmed') go('confirm');
          if (!result.error && result.data.user?.email_confirmed_at) navigate(destination);
          break;
        case 'signup':
          result = await auth.signUp({ email: address, password });
          if (!result.error) {
            go('confirm');
            setStatus('请检查收件箱和垃圾邮件，输入注册验证码。');
          }
          break;
        case 'confirm':
          result = resend
            ? await auth.resend({ type: 'signup', email: address })
            : await auth.verifyOtp({ type: 'email', email: address, token: code.trim() });
          if (!result.error && resend) setStatus('如果邮箱尚未验证，请查看最新一封邮件。');
          if (!result.error && !resend) navigate(destination);
          break;
        case 'forgot':
          result = await auth.resetPasswordForEmail(address);
          if (!result.error) {
            go('recover');
            setStatus('如果邮箱已注册，请查看收到的找回验证码。');
          }
          break;
        case 'recover': {
          if (resend) {
            result = await auth.resetPasswordForEmail(address);
            if (!result.error) setStatus('如果邮箱已注册，请查看最新一封邮件。');
            break;
          }
          const { recoveryClient } = await import('../lib/supabase-auth');
          const client = recoveryClient();
          result = await client.verifyOtp({ type: 'recovery', email: address, token: code.trim() });
          if (!result.error && result.data.session) {
            setRecovery(client);
            go('reset');
          }
          break;
        }
        case 'reset':
          if (!recovery) {
            go('forgot');
            break;
          }
          result = await recovery.updateUser({ password });
          if (!result.error) {
            await recovery.signOut({ scope: 'local' });
            setRecovery(null);
            go('login');
            setStatus('密码已更新，请用新密码登录。');
          }
          break;
      }
      if (result?.error) setError(errorText(result.error));
    } catch {
      setError('连接账号服务失败，请稍后再试。');
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    setPending(true);
    setError('');
    try {
      const { error } = await (await memberAuth()).signOut({ scope: 'local' });
      if (error) setError('退出失败，请重试。');
      else go('login');
    } catch {
      setError('退出失败，请重试。');
    } finally {
      setPending(false);
    }
  }

  const accountSummary = !!session && mode === 'login' && !status;
  const askingCode = mode === 'confirm' || mode === 'recover';
  const askingPassword = mode === 'login' || mode === 'signup' || mode === 'reset';
  const button = askingCode
    ? '验证邮箱'
    : mode === 'forgot'
      ? '发送找回验证码'
      : mode === 'signup'
        ? '发送注册验证码'
        : mode === 'reset'
          ? '保存新密码'
          : '登录';

  const displayEmail = accountSummary ? session.user.email : email.trim() || '等待填写邮箱';

  return (
    <div className="member-account">
      <div className="account-intro">
        <div className="account-kicker" aria-hidden="true">
          <Sparkles size={14} />
          <span>轻匣账号</span>
        </div>
        <LockKeyhole size={27} aria-hidden="true" />
        <h1>{accountSummary ? '我的账号' : headings[mode]}</h1>
        <p>{accountSummary ? '已登录，可以使用工具、留言墙和纪念日提醒。' : subtitles[mode]}</p>

        <div
          ref={passcardRef}
          onPointerMove={handleCardMove}
          onPointerLeave={handleCardLeave}
          className={`qingxia-passcard ${accountSummary ? 'is-verified' : ''}`}
          aria-hidden="true"
        >
          <div className="passcard-foil" />
          <div className="passcard-top">
            <span className="passcard-chip">
              <Cpu size={15} />
              QINGXIA · 轻匣
            </span>
            <span className="passcard-badge">{accountSummary ? '已登录' : headings[mode]}</span>
          </div>
          <div className="passcard-middle">
            <small>账号邮箱</small>
            <strong>{displayEmail}</strong>
          </div>
          <div className="passcard-bottom">
            <span>
              <ShieldCheck size={13} /> 文件本地处理
            </span>
            <span>
              <CheckCircle2 size={13} /> 工具免费使用
            </span>
          </div>
        </div>

        <Link to="/">
          <ArrowLeft size={16} /> 返回工具箱
        </Link>
      </div>

      <div className="account-panel">
        <div className="account-panel-glow" aria-hidden="true" />
        {!ready ? (
          <p role="status">正在检查登录状态…</p>
        ) : accountSummary ? (
          <div className="account-verified-box">
            <div className="account-verified-head" aria-hidden="true">
              <span className="verified-avatar">
                <UserCheck size={22} />
              </span>
              <div>
                <small>邮箱已验证</small>
                <span>你已登录轻匣</span>
              </div>
            </div>
            <p className="account-email">{session.user.email}</p>
            <div className="account-verified-actions">
              <Link className="button button-primary" to={destination}>
                继续使用 <ArrowRight size={16} />
              </Link>
              <button
                className="button button-secondary"
                type="button"
                disabled={pending}
                onClick={() => void logout()}
              >
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-mode-pills" aria-hidden="true">
              <span className={mode === 'login' ? 'is-current' : ''}>
                <KeyRound size={13} /> 账号登录
              </span>
              <span className={mode === 'signup' || mode === 'confirm' ? 'is-current' : ''}>
                <Sparkles size={13} /> 免费注册
              </span>
              <span
                className={
                  mode === 'forgot' || mode === 'recover' || mode === 'reset' ? 'is-current' : ''
                }
              >
                <Mail size={13} /> 找回密码
              </span>
            </div>
            <form
              className="community-form auth-studio-form"
              onSubmit={(event) => void submit(event)}
            >
              {mode !== 'reset' && (
                <label>
                  邮箱
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    maxLength={254}
                    required
                    readOnly={askingCode && !!email && pending}
                  />
                </label>
              )}
              {askingPassword && (
                <label>
                  {mode === 'reset' ? '新密码' : '密码'}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? '输入密码' : '至少 10 位'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'login' ? undefined : 10}
                    maxLength={72}
                    required
                  />
                </label>
              )}
              {askingCode && (
                <label>
                  邮件验证码
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="输入邮件里的数字验证码"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,8}"
                    maxLength={8}
                    required
                  />
                </label>
              )}
              {mode === 'signup' && (
                <p className="muted">
                  注册前请阅读<Link to="/privacy">隐私说明</Link>。密码至少 10 位。
                </p>
              )}
              <button className="button button-primary auth-submit-btn" disabled={pending}>
                {pending ? '处理中…' : button}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <div className="community-actions auth-switch-actions">
                {mode !== 'login' && (
                  <button type="button" onClick={() => go('login')} disabled={pending}>
                    返回登录
                  </button>
                )}
                {mode === 'login' && (
                  <>
                    <button type="button" onClick={() => go('signup')} disabled={pending}>
                      免费注册
                    </button>
                    <button type="button" onClick={() => go('forgot')} disabled={pending}>
                      忘记密码
                    </button>
                    <button type="button" onClick={() => go('confirm')} disabled={pending}>
                      验证注册邮箱
                    </button>
                  </>
                )}
                {askingCode && (
                  <button
                    type="button"
                    onClick={() => void submit(undefined, true)}
                    disabled={pending || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}
                  >
                    重新发送验证码
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        {error && (
          <p className="community-error" role="alert">
            {error}
          </p>
        )}
        {status && <p role="status">{status}</p>}
      </div>
    </div>
  );
}
