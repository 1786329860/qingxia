import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';
import { feedbackEmail, feedbackMailto } from '../lib/contact';
import { copyText } from '../lib/files';
import './feedback-contact.css';

export default function FeedbackContact() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const copyEmail = async () => {
    setError('');
    try {
      await copyText(feedbackEmail);
      if (!mounted.current) return;
      setMessage('邮箱已复制');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), 1800);
    } catch {
      if (mounted.current) setError('暂时无法复制，请选中上方邮箱地址手动复制。');
    }
  };
  return (
    <section className="feedback-contact" aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">反馈与建议</h2>
      <p>遇到了问题，或想让轻匣再顺手一点？欢迎告诉我工具名称、遇到的情况或你的想法。</p>
      <a className="feedback-email" href={feedbackMailto}>
        {feedbackEmail}
      </a>
      <div className="feedback-actions">
        <a className="button button-primary" href={feedbackMailto}>
          <Mail size={16} />
          邮件反馈
        </a>
        <button className="button button-secondary" onClick={copyEmail}>
          {message ? <Check size={16} /> : <Copy size={16} />}复制邮箱
        </button>
        <span className="feedback-copy-status" role="status" aria-live="polite">
          {message}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="feedback-hint">
        “邮件反馈”会打开你的邮件应用；也可以复制邮箱，在常用邮箱中发送。
      </p>
    </section>
  );
}
