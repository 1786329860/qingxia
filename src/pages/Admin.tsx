import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Eye,
  Users,
  MousePointer2,
  CircleCheck,
  LockKeyhole,
  ArrowRight,
  RefreshCw,
  LogOut,
  Download,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import { tools } from '../lib/registry';
import { downloadText } from '../lib/files';
import { Notice } from '../components/ToolUI';
import './admin-surfaces.css';
interface Counts {
  views: number;
  visitors: number;
  uses: number;
}
interface Stats {
  summary: Counts & { success: number };
  daily: (Counts & { day: string })[];
  hourly: (Counts & { hour: string })[];
  tools: { id: string; uses: number; success: number; errors: number }[];
}
function localDay(offset = 0) {
  return new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
}
const colors = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`);
function example(): Stats {
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: localDay(i - 6),
    views: 140 + i * 27 + (i % 2) * 32,
    visitors: 82 + i * 13,
    uses: 100 + i * 21 - (i === 6 ? 63 : 0),
  }));
  const uses = [327, 243, 187, 149, 98, 74];
  return {
    summary: {
      views: daily.reduce((n, d) => n + d.views, 0),
      visitors: daily.reduce((n, d) => n + d.visitors, 0),
      uses: uses.reduce((a, b) => a + b, 0),
      success: 1042,
    },
    daily,
    hourly: Array.from({ length: 24 }, (_, i) => ({
      hour: `${localDay()} ${String(i).padStart(2, '0')}:00`,
      views: Math.round(7 + Math.sin(i / 4) ** 2 * 32),
      visitors: Math.round(3 + Math.sin(i / 4) ** 2 * 17),
      uses: Math.round(4 + Math.sin(i / 4) ** 2 * 24),
    })),
    tools: uses.map((n, i) => ({
      id: ['image-compress', 'pdf-merge', 'json', 'qr', 'video-frames', 'image-convert'][i],
      uses: n,
      success: n - 6,
      errors: 6,
    })),
  };
}
function fillDays(from: string, to: string, data: Stats['daily']) {
  const rows = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const day = new Date(t).toISOString().slice(0, 10);
    rows.push({
      ...{ views: 0, visitors: 0, uses: 0 },
      ...data.find((d) => d.day === day),
      label: day.slice(5),
    });
  }
  return rows;
}
export default function Admin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [from, setFrom] = useState(localDay(-6));
  const [to, setTo] = useState(localDay());
  const [granularity, setGranularity] = useState('daily');
  const [hourDay, setHourDay] = useState(localDay());
  async function load(start = from, end = to) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin?from=${start}&to=${end}`, {
        credentials: 'same-origin',
      });
      const data = await response
        .json()
        .catch(() => ({ error: '统计服务未启动。请按部署说明配置 Vercel 与 Supabase。' }));
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (
        !response.ok ||
        !data.summary ||
        !Array.isArray(data.daily) ||
        !Array.isArray(data.hourly) ||
        !Array.isArray(data.tools)
      )
        throw new Error(data.error || '统计服务返回了无效数据，请检查部署配置。');
      setStats(data);
      setHourDay((previous) => (previous < start || previous > end ? end : previous));
      setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '统计暂不可用');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const data = await response
        .json()
        .catch(() => ({ error: '本地未启动统计服务，请查看部署说明。' }));
      if (!response.ok) throw new Error(data.error || '验证失败');
      setPassword('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    await fetch('/api/admin', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    setAuthenticated(false);
    setStats(null);
    setDemo(false);
  }
  const preview = () => {
    setStats(example());
    setDemo(true);
    setLoading(false);
    setError('');
    setFrom(localDay(-6));
    setTo(localDay());
  };
  if (!authenticated && !demo)
    return (
      <div className="admin-gate">
        <div className="admin-gate-orb" aria-hidden="true">
          <LockKeyhole size={30} />
        </div>
        <h1>站长工作台</h1>
        <p>看看轻匣，正在帮到多少人。</p>
        <form onSubmit={login}>
          <label className="field">
            <span className="field-label">站长密码</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="请输入专属访问密码"
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="button button-primary" disabled={loading} aria-busy={loading}>
            {loading ? '正在连接…' : '进入工作台'}
            <ArrowRight size={17} />
          </button>
        </form>
        {error && (
          <div role="alert">
            <Notice tone="warning">{error}</Notice>
          </div>
        )}
        <div className="admin-gate-note">
          <ShieldCheck size={14} />
          <span>独立密码保护 · 普通用户无需登录</span>
        </div>
        <button className="text-button" onClick={preview}>
          <FlaskConical size={14} />
          预览统计界面（示例数据）
        </button>
      </div>
    );
  const data = stats!;
  const chart =
    granularity === 'daily'
      ? fillDays(from, to, data.daily)
      : Array.from({ length: 24 }, (_, i) => {
          const hour = `${hourDay} ${String(i).padStart(2, '0')}:00`;
          return {
            ...{ views: 0, visitors: 0, uses: 0 },
            ...data.hourly.find((h) => h.hour === hour),
            label: `${String(i).padStart(2, '0')}:00`,
          };
        });
  const total = data.summary.uses;
  const success = total ? `${((data.summary.success / total) * 100).toFixed(1)}%` : '—';
  const pie = data.tools.map((t) => ({
    ...t,
    name: tools.find((x) => x.id === t.id)?.name || t.id,
  }));
  return (
    <div className="admin-page" data-mode={demo ? 'demo' : 'live'} aria-busy={loading}>
      <header className="admin-heading">
        <div>
          <h1>
            站长工作台
            <span className={`live-pill ${demo ? 'is-demo' : ''}`}>
              {demo ? '演示模式' : '私有统计'}
            </span>
          </h1>
          <p>了解每一次访问，让小工具更好用。</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => {
            if (demo) {
              setDemo(false);
              setStats(null);
              void load();
            } else void logout();
          }}
        >
          <LogOut size={15} />
          {demo ? '退出演示' : '退出后台'}
        </button>
      </header>
      {demo && (
        <Notice tone="warning">
          正在展示示例数据，仅用于预览界面，不代表网站真实访问。退出示例并完成站长验证后，才能查看真实统计。
        </Notice>
      )}
      {error && <Notice tone="warning">{error}</Notice>}
      <div className="dashboard-filters">
        <div className="segmented" role="group" aria-label="统计时间范围">
          {[
            { label: '今天', n: 0 },
            { label: '近 7 天', n: 6 },
            { label: '近 30 天', n: 29 },
          ].map(({ label, n }) => (
            <button
              key={n}
              className={from === localDay(-n) && to === localDay() ? 'active' : ''}
              aria-pressed={from === localDay(-n) && to === localDay()}
              onClick={() => {
                const start = localDay(-n);
                setFrom(start);
                setTo(localDay());
                if (!demo) void load(start, localDay());
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="date-range">
          <input
            type="date"
            aria-label="统计开始日期"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>—</span>
          <input
            type="date"
            aria-label="统计结束日期"
            value={to}
            min={from}
            max={localDay()}
            onChange={(e) => setTo(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="刷新统计"
            disabled={loading || demo}
            onClick={() => void load()}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      <div className="admin-grid">
        {[
          { label: '访问次数 PV', value: data.summary.views, icon: Eye, note: '页面被打开的次数' },
          {
            label: from === to ? '当日访客 UV' : '累计日访客',
            value: data.summary.visitors,
            icon: Users,
            note: '同一浏览器，每日匿名去重',
          },
          {
            label: '工具使用次数',
            value: total,
            icon: MousePointer2,
            note: '成功与失败的处理次数',
          },
          {
            label: '处理成功率',
            value: success,
            icon: CircleCheck,
            note: '成功处理次数 / 总处理次数',
          },
        ].map(({ label, value, icon: Icon, note }) => (
          <section className="stat-card" key={label}>
            <span className="stat-label">
              <Icon size={17} />
              {label}
            </span>
            <strong className="stat-value">
              {typeof value === 'number' ? value.toLocaleString('zh-CN') : value}
            </strong>
            <span className="stat-note">{note}</span>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="chart-card trend-card">
          <div className="chart-heading">
            <div>
              <h2>访问与使用趋势</h2>
              <span>北京时间 · UTC+8</span>
            </div>
            <div className="segmented" role="group" aria-label="趋势时间粒度">
              <button
                className={granularity === 'daily' ? 'active' : ''}
                aria-pressed={granularity === 'daily'}
                onClick={() => setGranularity('daily')}
              >
                按日
              </button>
              <button
                className={granularity === 'hourly' ? 'active' : ''}
                aria-pressed={granularity === 'hourly'}
                onClick={() => setGranularity('hourly')}
              >
                按小时
              </button>
            </div>
          </div>
          {granularity === 'hourly' && (
            <input
              className="hourly-date"
              type="date"
              aria-label="查看某日每小时数据"
              min={from}
              max={to}
              value={hourDay}
              onChange={(e) => setHourDay(e.target.value)}
            />
          )}
          <div className="chart-legend">
            <span>
              <i style={{ background: colors[0] }} />
              访问次数
            </span>
            <span>
              <i style={{ background: colors[1] }} />
              访客数
            </span>
            <span>
              <i style={{ background: colors[2] }} />
              工具使用
            </span>
          </div>
          <div className="trend-plot" style={{ height: 280, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 10, right: 8, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="views" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[0]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line-strong)" strokeDasharray="2 6" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 12,
                    color: 'var(--text)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="访问次数"
                  stroke={colors[0]}
                  strokeWidth={2.5}
                  fill="url(#views)"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  name="访客数"
                  stroke={colors[1]}
                  strokeWidth={2}
                  fill="transparent"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="uses"
                  name="工具使用"
                  stroke={colors[2]}
                  strokeWidth={1.5}
                  fill="transparent"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="chart-card distribution-card">
          <div className="chart-heading">
            <div>
              <h2>工具使用分布</h2>
              <span>按使用次数统计</span>
            </div>
          </div>
          {total > 0 ? (
            <>
              <div className="donut-wrapper">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pie}
                      dataKey="uses"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={72}
                      outerRadius={96}
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {pie.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: 12,
                        color: 'var(--text)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <strong>{total.toLocaleString('zh-CN')}</strong>
                  <span>次工具使用</span>
                </div>
              </div>
              <div className="donut-legend">
                {pie.slice(0, 6).map((t, i) => (
                  <div key={t.id}>
                    <i style={{ background: colors[i % colors.length] }} />
                    <span>{t.name}</span>
                    <strong>{((t.uses / total) * 100).toFixed(1)}%</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="chart-empty">
              还没有工具使用数据
              <br />
              <small>有真实使用后，这里会亮起来。</small>
            </div>
          )}
        </section>
      </div>
      <section className="chart-card usage-table">
        <div className="chart-heading">
          <div>
            <h2>工具使用明细</h2>
            <span>只有统计数量，不包含用户的文件和输入</span>
          </div>
          <button
            className="button button-secondary"
            disabled={!pie.length}
            onClick={() =>
              downloadText(
                '\ufeff工具,使用次数,成功次数,失败次数,占比\r\n' +
                  pie
                    .map((t) =>
                      [
                        t.name,
                        t.uses,
                        t.success,
                        t.errors,
                        `${((t.uses / total) * 100).toFixed(1)}%`,
                      ].join(','),
                    )
                    .join('\r\n'),
                `轻匣统计-${from}-${to}${demo ? '-示例' : ''}.csv`,
                'text/csv;charset=utf-8',
              )
            }
          >
            <Download size={14} />
            导出 CSV
          </button>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="工具使用明细，可左右滚动"
          tabIndex={0}
        >
          <table>
            <caption className="sr-only">
              所选日期内，各工具的使用次数、成功和失败次数及使用占比。
            </caption>
            <thead>
              <tr>
                <th>工具名称</th>
                <th>使用次数</th>
                <th>成功次数</th>
                <th>失败次数</th>
                <th>使用占比</th>
              </tr>
            </thead>
            <tbody>
              {pie.map((t, i) => (
                <tr key={t.id}>
                  <th scope="row">
                    <i className="table-dot" style={{ background: colors[i % colors.length] }} />
                    {t.name}
                  </th>
                  <td>{t.uses}</td>
                  <td>{t.success}</td>
                  <td>{t.errors}</td>
                  <td>
                    <div className="table-share">
                      <span
                        style={{
                          width: `${(t.uses / total) * 100}%`,
                          background: colors[i % colors.length],
                        }}
                      />
                    </div>
                    {((t.uses / total) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pie.length && <div className="chart-empty">所选日期暂无使用记录。</div>}
        </div>
      </section>
      <p className="admin-footnote">
        <ShieldCheck size={14} />
        数据采用匿名统计，可能受关闭统计、浏览器拦截或网络影响。多日访客为日 UV
        之和，不能视为跨日独立人数。页面成功率表示处理任务结果，不代表下载已经完成。
      </p>
    </div>
  );
}
