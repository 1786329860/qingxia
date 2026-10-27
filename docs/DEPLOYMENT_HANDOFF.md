# 轻匣云端部署交接报告

> 这是首轮部署的历史报告。后续 2026-10-27 的工具开发、实际生产版本、统计复测与 Cron 成功执行记录见 [持续开发交付记录](DEVELOPMENT_2026-10-27.md)。以下验收时间点和旧 SHA 保留，不代表最新 main。

记录日期：2026-10-27，时区 Asia/Shanghai。本轮已完成网站上线、真实统计接通、安全配置和交接验收；以下保留实际验证范围与尚未观察的外部边界，不包含任何密码、密钥或会话值。

## 一、项目与部署身份

| 项目 | 实际值 / 当前状态 |
| --- | --- |
| GitHub 仓库 | https://github.com/1786329860/qingxia |
| 生产分支 | main |
| 验收时生产完整提交 SHA | 1bcd61808d480817355d22a920893a1e2e2f985d |
| 对应自动生产部署 ID | dpl_3Qh26kcWSozn4eSu6MKppHMqZjPk，READY |
| 自动部署来源 / 函数区域 | source=git / sin1 |
| Vercel 项目名称 | qingxia |
| Vercel 项目 ID | prj_55fokWstGCCOu9tMvrCHwzXmgVmx |
| Vercel 团队 ID | team_m1W9gCQTNwwHKV9Jn0ACYUgl |
| Vercel 方案 | Hobby 免费方案 |
| 默认生产地址 | https://qingxia.vercel.app |
| 另一个默认别名 | https://qingxia-1786329860s-projects.vercel.app |
| 自定义域名 | https://qingxia.aixiaolv.icu |
| Supabase 项目名称 / ref | qingxia / ampgvmvtxutetcpwhztr |
| Supabase 组织 | 1786329860's Org / dkzmowhtixivgmwlryou |
| Supabase 地区 | ap-southeast-1，新加坡 |
| Supabase 项目 URL | https://ampgvmvtxutetcpwhztr.supabase.co |
| Supabase 状态 / 方案 | ACTIVE_HEALTHY / Free；创建报价 $0/月 |

上述 SHA 是交接验收时已确认的生产版本，包含应用首版及必要的部署文档兼容说明。本交接报告随后作为文档提交发布会再次改变 SHA；报告发布后的完整最终 SHA、部署 ID 和健康快照，以最终交付消息及本机 `F:\轻匣\logs\final-deployment.json` 为准，不在文件内伪造自身尚未产生的提交 SHA。

## 二、已经执行并验证

### 1. 免费项目与 Vercel 配置

先检查现有项目后创建轻匣所需项目，没有复用其他业务项目。没有购买服务、升级付费或启用计费扩容。

Vercel 已连接 `1786329860/qingxia` 的 main，设置为 Vite、仓库根目录、Node.js 24.x、安装 `npm ci`、构建 `npm run build`、输出 `dist`。保留 `vercel.json` 的 API、SPA 路由和响应头，保留 `prebuild` 资源准备脚本。已从上述完整提交成功构建生产部署。

**main 推送自动生产部署已经实际验证。** 正常推送文档提交 `1bcd61808d480817355d22a920893a1e2e2f985d` 后，Vercel 自动创建来源为 `git` 的部署 `dpl_3Qh26kcWSozn4eSu6MKppHMqZjPk`，状态 READY，提交 SHA 精确一致，函数区域为 sin1。此证据同时确认 Vercel 的 GitHub 集成具有本仓库读取与后续推送更新权限。原开发助手可继续正常向 main 推送，无需手工上传 dist。

### 2. 环境变量与密钥处置

| 环境变量名称 | Production 配置状态 | 存储类型 |
| --- | --- | --- |
| SUPABASE_URL | 已配置 | encrypted |
| SUPABASE_SERVICE_ROLE_KEY | 已配置，当前使用 Supabase 服务端 secret key，服务端 SDK 已兼容 | sensitive |
| ADMIN_PASSWORD | 已安全更新为 19 字符分组随机密码，两站真实登录已验证 | sensitive |
| ADMIN_SESSION_SECRET | 已配置，满足至少 32 个随机字符 | sensitive |

全部变量保持原名称，没有添加 `VITE_` 前缀，未提交到 Git。重新部署后的生产环境已实际写入统计，且默认域名与自定义域名均通过真实后台密码登录，确认四项配置实际生效。

旧 legacy JWT API keys 曾进入工具输出；已告知用户，并在用户确认后禁用旧 JWT API keys，界面出现重新启用入口，确认禁用状态。生产已改用新的服务端 secret key。交接报告不包含任何旧值或新值，后续不要重新启用旧密钥。

管理员密码已用当前 Windows 用户的 DPAPI 加密保存到 `F:\轻匣\private\admin-password.dpapi`，目录 ACL 仅允许当前用户 SID 与 SYSTEM。用户双击 `F:\轻匣\打开站长密码.cmd`，可在本机显示、复制密码或打开后台；对应脚本为 `F:\轻匣\scripts\view-admin-password.ps1`。已验证可解密且长度为 19，没有在 Git、报告或聊天提供明文。此加密交付依赖当前 Windows 用户，不能将文件复制到其他用户或机器后期待直接解密。

如需重设，在 Vercel 的 `qingxia` 项目 **Settings → Environment Variables → ADMIN_PASSWORD → Production** 更新为至少 12 字符的新密码，再重新部署。不要在聊天或仓库填写明文。临时 Vercel CLI 已执行 logout，本轮创建的本地 CLI 凭据文件已移除；平台访问令牌不作为交付物，仅保留密码的本机 DPAPI 交付文件。

### 3. 数据库迁移与访问权限

| 实际执行内容 | 数据库迁移名 | 版本 | 结果 |
| --- | --- | --- | --- |
| supabase/migrations/001_analytics.sql | qingxia_analytics | 20261026132319 | 成功 |
| 按官方说明启用 pg_cron | qingxia_enable_pg_cron | 20261026132327 | 成功 |
| supabase/migrations/002_retention_cron.sql | qingxia_retention_cron | 20261026132328 | 成功 |

`qingxia_events` 与 `qingxia_rate_buckets` 均已创建并启用 RLS。anon、authenticated 对两表均无 SELECT/INSERT/DELETE 权限，也无统计、限流和清理函数的 EXECUTE 权限；两个角色共 12 项实际拒绝测试通过。三个函数均为 security invoker，没有通过 security definer 绕过权限。

service_role 的事件写入、统计、趋势和工具明细、共享限流、清理函数均已在真实数据库中通过回滚事务验证。测试包含同访客两个 PV 只产生一个日 UV，以及限流额度为 1 时首次允许、第二次拒绝。另验证 91 天前事件被清理、89 天前事件保留，过期桶清理而有效桶保留。所有数据库测试事务均已回滚，没有留下测试事件或桶。

### 4. Cron 自动清理

| 项目 | 实查结果 |
| --- | --- |
| 扩展 | pg_cron 1.6.4 |
| cron.timezone | GMT，即 UTC+00:00 |
| jobid / 任务名称 | 1 / qingxia-retention-cleanup |
| Cron 表达式 | 17 19 * * * |
| 北京时间 | 每天 03:17 |
| active | true |
| 执行角色 / 数据库 | postgres / postgres |
| 执行内容 | select public.qingxia_cleanup(); |

已查询 `cron.job`，确认不是只创建函数，任务真实存在且启用。清理函数已经实际调用验证；尚未等待未来首次按计划触发的运行记录。

### 5. 真实统计

已在同一个浏览器中完成主页访问、JSON 处理和重复处理，并直接读取 Supabase 的真实聚合核对变化：

| 同一浏览器控制步骤 | PV | 当日匿名 UV | 工具次数 |
| --- | --- | --- | --- |
| 起始基线 | 0 | 0 | 0 |
| 第一次访问主页 | 1 | 1 | 0 |
| 进入 JSON 工具并成功处理 | 2 | 1 | 1 |
| 同浏览器刷新后再次成功处理 | 3 | 1 | 2 |

每日、每小时与工具明细记录与上述数据匹配。这是线上真实事件和数据库结果，不是示例图表。该控制序列是特定验收时点的快照，后续验收和真实访问会继续增加统计。

2026-10-27 00:25 左右的补充核对中，两站真实私有统计 API 与 Supabase SQL 完全一致：当日 PV=48、匿名日 UV=24、工具次数=20、成功=19，daily/hourly/tools 数据一致。**这些数字大多来自自动化验收流量与独立浏览器上下文，不能当作真实自然用户增长或自然人数。**

访客口径为同浏览器每日匿名去重数，不是准确自然人数；多日访客数为日 UV 之和。DNT、关闭匿名统计、浏览器或网络限制会影响计数。

默认域名与 Cloudflare 自定义域名均已通过真实密码在浏览器登录后台，确认处于真实数据模式，没有示例标识；按日、按小时折线图 SVG、环形图和明细表均已实际检查，随后已退出后台。截图：`admin-real-daily.png`、`admin-real-hourly.png`、`admin-real-cloudflare.png`、`admin-real-cloudflare-hourly.png`。

两站接口实测均为：未登录 GET `/api/admin` 返回 401、密码验证 200、登录后私有统计 200、退出 200。会话 Cookie 包含 HttpOnly、Secure、SameSite=Strict、Path=/api；私有响应为 `Cache-Control: no-store`，Cloudflare 上为 `CF-Cache-Status: DYNAMIC`，未被缓存。示例模式仍只能显式进入，并明确标注，未用示例数据冒充统计接通。

### 6. 本地工具、资源与隐私

- `npm test`：123/123 通过；生产构建成功。
- 本机系统 Edge 浏览器测试：14/14 通过。
- 默认生产地址上的浏览器测试：14/14 通过，涵盖首页搜索、收藏与最近使用、22 个直接工具路由、移动布局及后台默认保护/示例隔离。
- Cloudflare 自定义域名上的原测试累计通过 13/14。剩余项为 AVIF 下载按钮须在 5 秒内出现的时限断言不稳定；没有放宽断言或修改原测试，因此不宣称该域名整套 14/14。独立功能检查已成功完成真实 AVIF 转换、下载和 64×48 重解码，曾耗时 7.059 秒，禁用额外 RUM 后一次实测为 3.900 秒。
- 生产图片测试实际生成 AVIF 并重新解码、下载 WebP ZIP；PDF 合并、拆分、转 PNG、图片转 PDF 均检查真实输出；JSON 已处理并下载真实结果。
- 生产媒体测试实际生成并下载 GIF、抽帧 JPG ZIP、MP3/WAV，检查文件签名、可解码性和音轨时长。
- 15 个生产静态资源检查全部 HTTP 200，内容与构建结果一致：包括约 32 MB FFmpeg WASM、PDF 字体/CMap、AVIF 编解码 WASM 和图片/PDF/媒体 Worker；浏览器处理未发生阻断使用的资源 404 或跨域故障。
- 请求检查通过：本地工具没有上传文件内容、文件名或输入正文，只发送白名单匿名事件。抖音是独立标记的联网工具。
- Cloudflare 曾自动注入 `/cdn-cgi/rum` 性能请求，触发原有严格隐私断言；已仅对轻匣域名禁用 RUM，四项受影响原测试重跑通过，后续 AVIF 独立检查的写请求也只有 `/api/events`。没有修改应用隐私断言来掩盖额外请求。
- 使用官方 npm 源的生产依赖审计：0 项已知漏洞；本机默认镜像曾返回下载 404，命令级使用官方源后安装通过，未修改依赖或锁文件。

### 7. 域名与 Cloudflare

`aixiaolv.icu` 为已有的活动 Free 域名。已添加 `qingxia.aixiaolv.icu`：

| 项目 | 当前已验证结果 |
| --- | --- |
| Cloudflare zone ID | badff137670498f48a75baa20d123888 |
| 记录 | CNAME qingxia |
| Vercel 返回目标 | 0f401fbbc786879d.vercel-dns-017.com |
| 当前记录代理状态 | 已启用代理，橙云，自动 TTL |
| TLS / HTTP | 自定义域名 HTTPS 已返回 200 |
| 全区 SSL/TLS | 完全（严格），保留原设置 |
| 私有 API 缓存 | 未登录 401 / 登录后 200，no-store，DYNAMIC |

缓存规则、缓存响应规则和旧 Page Rules 均为空，没有启用会缓存后台接口的规则。没有修改已有 apex/ppt/www 等无关记录。

必要的隐私配置修复：新增一条免费 Configuration Rule `qingxia-disable-rum`（ID `3fc1298b2af945c2a848622c1582e52d`），条件仅为 `(http.host eq "qingxia.aixiaolv.icu")`，操作 `disable_rum: true`，状态 Active。保留原全区 Web Analytics 和其他域名设置，没有购买 Pro；修复后 HTTP 与浏览器请求均不再出现本站的自动 RUM beacon。

DNS、代理和 TLS 验证不等于中国大陆访问体验已经验证。本轮测试环境经过代理，尚未完成大陆无代理、多运营商及真实移动设备的大体积资源访问测试，不能承诺大陆畅通。

### 8. 抖音实验性工具

在生产 `/api/resolve` 测试人民网公开作品 `https://www.douyin.com/video/7397592518235393330`：HTTP **422**，约 3.1 秒，返回“平台未提供可读取的公开媒体信息，可能需要登录、已限制访问或更改了页面结构”。该测试只能证明此次解析失败，不能确定平台失败原因。

- 解析：失败，没有取得可用媒体信息。
- 下载：没有媒体结果可供下载，未执行，不能标为成功。
- 保留“实验性”标识，没有购买解析接口、添加媒体中转或绕过登录、验证码、平台限制，不阻塞其他本地工具上线。

## 三、仅配置、尚未观察与剩余边界

网站上线、main 自动生产更新、真实统计、独立密码后台和 Cloudflare 代理均已实际验证，没有需用户继续完成的云资源配置阻塞。用户只需在本机打开密码工具获取自己的后台密码；后续继续开发可交回原助手。

以下边界保留，不用上线成功掩盖：

1. **中国大陆实际网络尚未验证**：本轮测试走代理，没有大陆无代理、多运营商的独立证据，不能宣称已解决大陆访问。
2. **Cron 首次按计划触发尚未观察**：任务真实存在、active=true、时区和北京时间 03:17 调度正确，清理函数实际测试通过；尚未到未来首次执行时点，不额外等待或把配置误写为已观察到定时运行。
3. **Cloudflare AVIF 冷启动性能有波动**：真实输出与下载通过，但原测试 5 秒阈值不稳定；自定义域名原测试仅记 13/14，不记 14/14。
4. **抖音真实解析失败，下载未执行**：保持实验性；没有绕过平台限制，不阻塞其他工具。
5. **浏览器与设备范围有限**：本轮主要使用系统 Edge/Chromium，移动视口不等于所有真实手机和所有浏览器已经验收。
6. **运行时告警记录**：从 2026-10-27 00:22 北京时间起的 Vercel 运行时查询发现 `/api/admin` 一条 Node `DEP0169`（`url.parse` 弃用）告警，count=1，对应上述自动部署。实际 HTTP 验收成功，未见相关 5xx；没有为此扩展本轮代码修改，交给原开发助手后续评估依赖或运行时兼容性。

## 四、代码改动与继续开发约定

没有修改应用逻辑、重建项目、重新设计界面或重写工具。必要的文档兼容说明已正常提交并推送：

- `1bcd61808d480817355d22a920893a1e2e2f985d`：更新 `docs/DEPLOYMENT.md` 的服务端密钥说明，兼容现用 Supabase secret key，避免继续要求已禁用的旧 legacy JWT API keys。
- 本交接报告为后续单独文档提交；其最终完整 SHA 由最终交付消息和 `final-deployment.json` 记录。

没有强制推送或回退。Cloudflare RUM 修复为服务商配置，未改应用文件。

本轮只完成云端上线、真实统计、安全配置与验收，不扩展新功能。交回原开发助手后继续向 main 正常推送，并保留 21 个本地工具的隐私边界、独立密码后台和抖音实验性标识。

本轮详细本机证据位于 `F:\轻匣\logs\`：`supabase-validation.md`、`production-e2e.txt`、`production-resources.json`、`production-resources.txt`、`admin-http-validation.json`、`custom-domain-validation.md`、`cloudflare-validation.md`、`douyin-validation.json`、`npm-audit-production.json`，以及真实后台截图。本报告仅摘录非秘密验收结论；已有日志不代替上述明确保留的外部验证边界。
