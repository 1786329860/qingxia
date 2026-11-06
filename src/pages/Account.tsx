import { useEffect, useState, type FormEvent } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
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
  const next = search.get('next') || '/';
  const destination = /^(?:\/wall|\/tool\/[a-z-]+)$/.test(next) ? next : '/';
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

  return (
    <div className="member-account">
      <div className="account-intro">
        <LockKeyhole size={27} aria-hidden="true" />
        <h1>{accountSummary ? '我的账号' : headings[mode]}</h1>
        <p>一个免费账号，打开轻匣里的工具，也可以到留言墙留一张便利贴。</p>
        <Link to="/">
          <ArrowLeft size={16} /> 返回工具箱
        </Link>
      </div>
      <div className="account-panel">
        {!ready ? (
          <p role="status">正在检查登录状态…</p>
        ) : accountSummary ? (
          <>
            <p className="account-email">{session.user.email}</p>
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
          </>
        ) : (
          <form className="community-form" onSubmit={(event) => void submit(event)}>
            {mode !== 'reset' && (
              <label>
                邮箱
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
            <button className="button button-primary" disabled={pending}>
              {pending ? '处理中…' : button}
            </button>
            <div className="community-actions">
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
                  重新发码
                </button>
              )}
            </div>
          </form>
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
