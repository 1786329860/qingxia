# 中文名称搜索与必应收录基础

2026-10-27。用户希望在 Microsoft Edge 中输入中文名称找到轻匣，推广入口统一为 **https://qingxia.aixiaolv.icu/**。用户随后明确选择必应方向，不继续百度流程。

浏览器的历史记录/收藏与搜索引擎的公开收录是两件事。网站不能替所有人的浏览器预置历史或搜索联想；对新用户，需要搜索引擎发现、抓取、收录和排序。用户数量增加不等于必然收录或排名第一。推广时统一使用“轻匣”或更明确的“轻匣工具箱”，并保留固定网址。

## 已实现并本地验证

- 首页标题为“轻匣 - 免费无广告在线工具箱”，每个工具、关于和隐私页均有独立中文标题及真实描述。
- 使用 `WebSite` JSON-LD 标记中文品牌“轻匣”，备用名称“轻匣工具箱 / QINGXIA”，同时保持 `og:site_name` 一致。没有虚构评分、保证全平台解析或设置无效站内搜索动作。
- 所有公开页面规范地址固定在自定义域名；Vercel默认域名也指向该规范地址，不改变用户登录/API请求地址。
- 新增 `robots.txt` 和包含31个公开页面的 `sitemap.xml`（首页、28工具、关于、隐私），不列入后台、API、收藏和最近使用状态。
- 构建时从现有 React 页面生成真实公开HTML。JavaScript禁用时仍能读取首页工具清单、中文正文、每页标题和工具介绍；交互工具明确提示启用JavaScript，不假装能在无JS时处理文件。
- 预渲染不运行用户事件、统计或工具重引擎。后台仅生成空入口及不收录元信息，不预取、嵌入或公开统计数据；后台与API额外使用 `X-Robots-Tag: noindex, nofollow`，原独立密码与服务器鉴权保留。
- React客户端继续接管交互；路由切换同步更新元信息。未增加主题/任务组件key，没有让文件、进度或结果因元信息更新重建。未新增依赖、追踪脚本、用户登录、付费功能或文件上传。

生产构建保留原 `prebuild` 资源准备，新增 `postbuild` 生成公开HTML/站点地图。Vercel使用 `cleanUrls` 访问预渲染的HTML文件；SPA兜底目标相应改为 `/`，API排除和所有原安全响应头保持。依据：[Vercel Vite说明](https://vercel.com/docs/frameworks/frontend/vite)、[cleanUrls与rewrites](https://vercel.com/docs/project-configuration/vercel-json)。

本地验证：202项逻辑、安全和数据库测试通过，生产构建通过，整站44项浏览器测试通过（包括4项搜索元信息/原始HTML/禁用JavaScript用例）。本机证据保留在仓库外 `F:\轻匣\logs\seo-20261027\`。发布后实际SHA、READY、两域名原始HTML/robots/sitemap和私有API结果另存该目录，不把push成功当上线。

## 必应站长平台：已添加，等待发布后验证

用户完成电脑上Edge的登录跳转后，已在其必应站长账户中添加 `https://qingxia.aixiaolv.icu/`，选择HTML Meta Tag方式。平台提供的公开所有权验证标记已加入首页模板，随本批发布；该标记必须公开供必应读取，不是微软登录密码、会话或API凭据。平台验证和站点地图提交需在新生产页面可读取标记后执行，当前不写成已经验证或收录。

百度流程已按用户要求停止，没有提交其账户联系资料。搜索引擎账户的密码、手机/邮箱验证码、真实联系资料均不需要发送到聊天。

后续最少操作：

1. 在Edge登录 [必应站长工具](https://www.bing.com/webmasters/)，添加 `https://qingxia.aixiaolv.icu/`。
2. 选择HTML标签或XML文件验证；平台给出的是用于公开网页所有权验证的标记，不是登录密码。将公开HTML验证标签交给开发助手部署，或由用户把XML验证文件放入项目 `public/` 后正常发布。无需提供微软账号密码或一次性验证码。
3. 网站验证通过后，提交 `https://qingxia.aixiaolv.icu/sitemap.xml`，并在网址检查/URL提交中提交首页与重点工具页。
4. 通过平台观察抓取、索引和搜索展现；只有出现真实索引数据或实际搜索结果后才报告“已收录”。不承诺固定时间、排名第一或中文联想词一定出现。

提交站点地图只帮助发现页面，并不保证索引。参考：[必应站点验证](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b)、[必应站点地图](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed)、[必应收录排查](https://www.bing.com/webmasters/help/why-is-my-site-not-in-the-index-2141dfab)。

## 访客现在可用的快捷方式

访客可以在Edge按 `Ctrl+D` 将当前网站收藏为“轻匣”，以后从收藏夹打开。是否在地址栏自动建议取决于各自浏览器的历史、收藏和当前搜索引擎，网站不替用户修改默认搜索、主页或浏览器设置。
