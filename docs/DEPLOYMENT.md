# 轻匣部署指南

本项目面向个人、非商业使用，优先使用免费额度。免费额度及服务条款可能调整，创建资源时应选择免费方案；不启用自动付费扩容。以下说明不代表项目已经在你的外部账户中创建或部署。

## 1. 创建 Supabase 项目

打开 Supabase Dashboard，在自己的组织下新建免费项目。地区建议优先考虑实际用户网络和 Vercel API 的位置，例如可选的新加坡地区，但最终以账户提供的地区为准。

在 SQL Editor 依次执行：

1. `supabase/migrations/001_analytics.sql`：创建事件表、限流表、统计函数和权限。
2. 在 Database / Extensions 或 Integrations 中启用 Cron（`pg_cron`）。
3. `supabase/migrations/002_retention_cron.sql`：每天北京时间 03:17 清理 90 天前的原始事件和过期限流记录。执行后核对 `cron.job` 任务确实存在。

迁移可重复执行，保留已存在事件。不要给 `anon` 或 `authenticated` 新建访问事件表的策略，也不要把 `service_role` 密钥给前端。

## 2. 创建 Vercel 项目

在 Vercel 的 Add New Project 导入 GitHub 仓库 `1786329860/qingxia`，生产分支设为 `main`：

| 设置             | 内容                                  |
| ---------------- | ------------------------------------- |
| Framework Preset | Vite                                  |
| Root Directory   | 仓库根目录                            |
| Install Command  | `npm ci`                              |
| Build Command    | `npm run build`                       |
| Output Directory | `dist`                                |
| Node.js          | 24.x（或与已验证的 Node 24 兼容版本） |

构建包含同站 FFmpeg WASM 与 PDF 字体资源。不要删除 `scripts/prepare-assets.mjs`，不要将 `public/ffmpeg/` 手动上传到 Git。`vercel.json` 已配置 SPA 路由、解析函数超时和浏览器隔离响应头。

在 Vercel 的 **Settings → Environment Variables** 设置以下内容，生产与需要的预览环境分别配置：

| 名称                        | 从哪里取得 / 用途                                        |
| --------------------------- | -------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase Project Settings / API 中的项目 HTTPS URL       |
| `SUPABASE_SERVICE_ROLE_KEY` | 项目的服务端 Secret API key（`sb_secret_...`），或仍有效的 legacy `service_role` 密钥，仅服务端使用 |
| `ADMIN_PASSWORD`            | 自己设置的站长密码，至少 12 字符，建议使用密码管理器生成 |
| `ADMIN_SESSION_SECRET`      | 至少 32 个随机字符，用于会话签名、匿名散列和限流         |

这些值只填到服务商的安全环境变量设置中，不发到聊天，不提交 Git，也不使用 `VITE_` 前缀。更换 `ADMIN_SESSION_SECRET` 会使已有后台会话失效，并改变匿名散列。

环境变量名称保持不变。现有 Supabase 客户端支持 Secret API key，无需改写应用。若已禁用 legacy JWT API keys，必须使用有效的 Secret API key；创建新密钥本身不会撤销旧密钥，需在 Supabase 的 API Keys 页面单独禁用旧密钥。

重新部署后访问 `/admin`，输入站长密码。没有配置时只显示登录页和明确的配置错误；“预览统计界面”始终是单独标注的示例。

## 3. 自定义域名与 Cloudflare

1. 在 Vercel 的 Settings → Domains 添加域名。
2. 在 Cloudflare DNS 按 Vercel 当前提示添加记录，先使用 DNS only 验证域名归属与 TLS。
3. 实际测试大陆网络：主页、图片处理 Worker、AVIF WASM、PDF 字体和 32 MB FFmpeg 引擎。
4. 若之后启用 Cloudflare 代理，不要使用 Flexible SSL；保持 HTTPS，勿对 `/api/*` 缓存。
5. Cloudflare 缓存规则不要缓存后台接口、解析结果或带 Cookie 的私有响应。API 已发送 `Cache-Control: no-store`，应保留此行为。

Cloudflare 普通 DNS 或代理不能承诺大陆网络稳定性。不要缓存动态 API 来试图改善速度，也不要公开服务端密钥。

## 4. 验证真实统计

先退出后台，确保浏览器没有开启 Do Not Track 或站点“关闭匿名统计”设置：

1. 打开首页，再进入 JSON 工具。
2. 输入测试 JSON，完成一次处理。
3. 使用站长密码打开 `/admin`，选择“今天”并刷新。
4. 核对 PV、当日 UV、JSON 使用次数、小时趋势和环形图。
5. 再次使用同一浏览器处理，使用次数应增加，当日 UV 不因同浏览器重复访问而增加。
6. 确认匿名请求里没有输入正文；未登录请求 `/api/admin` 必须返回 401。

统计是近似数据。阻止统计、Do Not Track、网络失败、不同浏览器、无痕模式、共用设备和自动化流量都会影响结果；不能据此证明实际自然人数。

## 5. 抖音解析实际验收

解析接口部署在 Vercel，不依赖额外付费服务，只读取支持的公开页面。需要能访问这些页面域名：

`v.douyin.com`、`www.douyin.com`、`douyin.com`、`www.iesdouyin.com`、`iesdouyin.com`。

在实际部署环境中分别测试有权使用的公开视频与图集：粘贴分享文案 → 正确作品标题/作者 → 正确类型和数量 → 浏览器下载真实媒体。确认不会取到页面里的推荐作品。

平台可能返回登录、验证码或空页面，媒体也可能阻止 CORS 下载。本站明确报错、不无限重试、不绕过访问限制、不把媒体转发到自己的服务器。**在取得真实成功证据前，保持“实验性”标识。** 当前开发云机器的公开站点检查被出站代理 CONNECT 403 拦截，这不能证明 Vercel 部署后一定成功或失败。

## 6. 账户授权阻塞时

当前聊天中的“全权授权”允许执行项目创建与部署，但不能替代 Vercel / Supabase 的账户登录。若会话没有相应工具连接或有效平台凭据，不能代为创建账户资源。

如需要代理继续自动部署，可在云环境安全设置中配置有适当最小权限的 `VERCEL_TOKEN`、`SUPABASE_ACCESS_TOKEN`，并允许访问 `api.vercel.com`、`api.supabase.com`。不要把值放到仓库或聊天。之后再由代理验证账户/组织、创建免费资源、执行迁移和部署。数据库管理令牌与应用运行的 `service_role` 是不同用途，不互相替代。

域名 DNS 修改还需要 Cloudflare 对对应域名的账户权限；没有绑定时，应保留 Vercel 提供的公开地址，不能宣称自定义域名已经接入。
