# 轻匣 QINGXIA

把日常小事，轻轻解决。免费的中文在线工具箱：无需普通用户登录、无广告、优先在浏览器处理文件。

**当前包含 27 个本地工具、1 个实验性抖音解析工具，以及独立的 `/admin` 站长统计后台。** 六类趣味工具包括随机抽签、加权转盘、硬币、骰子、手持弹幕与颜文字，内容均留在浏览器。

2026-10-27 的上线版本、测试、真实统计及剩余事项见 [持续开发交付记录](docs/DEVELOPMENT_2026-10-27.md)。

“会呼吸的数字匣子”视觉与交互升级、同尺寸前后截图及性能实测见 [视觉升级交付](docs/VISUAL_UPGRADE_2026-10-27.md)；继续开发前请沿用 [DESIGN.md](DESIGN.md) 的系统规则。

中文名称搜索基础（公开页面预渲染、品牌标记、站点地图与必应站长验证待办）见 [搜索发现记录](docs/SEARCH_DISCOVERY_2026-10-27.md)。站点地图位于 `/sitemap.xml`，不代表搜索引擎已经收录或保证排名。

## 本地开发

使用 Node.js 24（建议与当前已验证环境一致），运行：

```sh
npm ci
npm run dev
```

`predev` / `prebuild` 自动将 FFmpeg 和 PDF 字体资源复制到同站目录。图片 AVIF 编解码器、PDF Worker 与媒体处理引擎均从本站加载，不依赖第三方公共 CDN。初次使用 GIF / 音频工具需下载约 32 MB 的处理引擎，之后文件处理发生在本地。

```sh
npm test          # 转换逻辑、边界、解析器及后台安全测试
npm run build    # TypeScript + 生产构建
npm run test:e2e # Chromium 浏览器集成测试
```

浏览器测试自动使用 `/usr/bin/chromium`（若存在）；其他机器先执行 `npx playwright install chromium`，或用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定浏览器路径。`npm run dev` 内置本地 API 适配器，无须另启服务。

## 免费部署

推荐 **GitHub + Vercel（网站与轻量接口）+ Supabase（匿名统计）**。不需要购买服务器。仅部署本地工具不需要 Supabase；真实统计需要完成以下配置。

完整图文结构化步骤见 [部署指南](docs/DEPLOYMENT.md)，验收范围见 [功能与验证说明](docs/VALIDATION.md)。

1. 在 Supabase 创建免费项目，执行 `supabase/migrations/001_analytics.sql`。
2. 启用 Supabase Cron 后执行 `002_retention_cron.sql`，配置每日数据清理。
3. 在 Vercel 导入此 GitHub 仓库，框架 Vite，构建命令 `npm run build`，输出目录 `dist`。
4. 在 Vercel 的项目设置填写 `.env.example` 列出的 4 个服务端环境变量，再部署。
5. 将自己的域名添加到 Vercel，再按 Vercel 给出的记录在 Cloudflare DNS 配置。DNS 解析本身不保证中国大陆访问体验，需实测页面和大体积 WASM 资源。

**不要给服务端密钥添加 `VITE_` 前缀，不要提交 `.env.local`、密码或密钥。** 本仓库没有预置后台密码，没有开放注册；站长使用自己设置的独立密码进入 `/admin`。

## 功能边界

- 图片：批量压缩、PNG/JPG/WebP/AVIF 真转换、ZIP 下载；动画只保留首帧。
- PDF：合并、按范围拆分、转图片、图片转 PDF、压缩。默认保留文字；图片化压缩需要明确同意；结果更大则保留原件。重新生成文档可能使数字签名失效。
- 媒体：视频抽帧、短片转 GIF、提取 MP3/WAV。受设备内存、编解码器和文件大小限制。
- 文本与换算：JSON、Base64、文本整理、CSV/JSON、单位、时间戳、精确整数进制。
- 开发工具：二维码、Hash、UUID/安全随机字符串、颜色转换。
- 链接解析：只读取用户主动提交的公开抖音页面；不保存媒体，不绕过登录或验证码。**当前未取得真实抖音解析/下载成功证据，不将其算作已通过完整验收的工具。**

## 匿名统计

统计访问次数、同浏览器每日匿名去重访客、工具处理次数及成功率，提供按日/小时趋势、工具环形图和 CSV 导出。多日访客是日 UV 之和，不代表跨日独立人数。不记录文件名、文件内容、输入正文或完整分享链接。

后台以 HttpOnly / Secure / SameSite Cookie 保护，服务端校验来源及登录限流。数据库事件表启用 RLS，访客没有读取原始事件或调用统计 RPC 的权限。未接数据库时后台只能显式选择「示例数据」预览；不会展示伪造的真实统计。

## 项目结构

```text
src/components/       视觉框架、首页和统一工具交互
src/tools/            按领域独立加载的工具模块
src/lib/registry.ts   工具元信息、分类与搜索关键词
src/pages/Admin.tsx   站长统计与图表
api/                  Vercel 服务端 API
supabase/migrations/  数据库权限、统计与数据保留
tests/                单元、安全及浏览器测试
docs/                 部署、边界与视觉参考
```

## 依赖与开源许可

项目使用的浏览器处理引擎及编解码器各自受其开源许可证约束。FFmpeg WASM 核心的构建、许可证及分发注意事项见 [第三方依赖说明](docs/THIRD_PARTY.md)。发布时保留对应许可证和源码获取方式。
