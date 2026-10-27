# 抖音公开分享链路：一手资料研究（2026-10-27）

本文件记录文档及作者源码研究，不代表轻匣已成功解析或下载。真实请求证据另见 `DOUYIN_INVESTIGATION.md` 和本轮链路记录。研究期间未登录抖音、未调用签名服务、未请求媒体、未取得或保存 Cookie、令牌、媒体签名 URL。

## 小程序成功与网页成功是两件事

腾讯维护的 [微信小程序 API 类型定义](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts) 在 `wx.downloadFile` 注释中说明：微信客户端直接发起 HTTPS GET，将响应写入本地文件并返回临时路径；业务仍须检查响应状态和内容，进入成功回调不代表得到正确媒体。[官方 API 页面](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html) 本次研究工具无法读取正文，因此具体下载行为依据腾讯源码注释，而不引用第三方转载。

网页的 `fetch` 使用另一套浏览器安全机制。跨源响应必须获得服务端 CORS 许可，脚本才能读取响应内容；服务端 HTTP 200、播放器能显示视频，均不能单独证明网页可以取得可保存的 Blob。依据：[WHATWG Fetch 标准：CORS](https://fetch.spec.whatwg.org/#http-cors-protocol)。

给跨站媒体链接增加 `download` 属性也不能可靠强制下载；对普通跨源地址，浏览器通常按导航处理，除非目标响应自己声明下载。[MDN：download 属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)。

未获得具体小程序名称、源码或其实际请求证据，不能认定其采用了哪种解析后端。它可能拥有不同服务端或使用原生下载能力；这是架构可能性，不是对某个小程序的事实判断。不能由“小程序能下载”推导“本站当前无代理网页链路也必定能下载”。

## 当前约束内的候选路径

新发现的抖音精选页面属于官方站点。其[官网首页](https://jingxuan.douyin.com/) 标示“抖音精选”，页脚列有备案号和经营资质；[官方隐私政策（2026-05-20 更新）](https://lf9-cdn-tos.draftstatic.com/obj/ies-hotsoon-draft/yumme/privacy_policy_qt.html) 明确该产品属于抖音、运营方为北京抖音科技有限公司。Apple 的[官方商店条目](https://apps.apple.com/cn/app/id6444170965) 也列出相同开发者。

因此可在保留全部 SSRF 和逐跳校验措施时，精确增补分享域名 `jingxuan.douyin.com`，无需放开 `*.douyin.com`。官网归属已经核实，媒体下载是否可用仍须另验。

以下是可限定验证的路径，**不是抖音对第三方开放的稳定 API 承诺，也没有因页面或源码存在而视为整条下载链路成功**。

| 优先级 | 有界尝试 | 来源与停止条件 |
| --- | --- | --- |
| 1 | 已知视频作品 ID 后，匿名读取 `https://jingxuan.douyin.com/m/video/{id}`，只解析响应自带的 `window._SSR_DATA` | 本轮链路调查已观察到 `data.storeState.detail.videoData.result.gid` 与目标作品 ID 精确匹配，`video_model` 字符串内有媒体列表。这里记录调查阶段结果，浏览器 CORS、真实文件下载及解码仍在验证。需严格限定目标 result，不能递归误取页面推荐视频。 |
| 2 | 已知作品 ID 后，匿名读取 `https://www.iesdouyin.com/share/video/{id}/`，只解析实际响应自带的 `window._ROUTER_DATA` 等 JSON | [作者 TypeScript 源码](https://github.com/ldsoy/douyin-video-parser/blob/master/src/parser.ts) 使用此移动分享页面。轻匣已有对应 JSON 解析能力，但先前原 URL 抓取不会自动补这一页面。本轮实际调查只观察到配置和作品 ID、没有媒体，不将其视为解析成功。 |
| 3 | 已确认是图集时，匿名读取同域 `share/note/{id}/` 或 `share/slides/{id}/`，仍要求数据中的目标作品 ID 精确匹配 | [作者 Python 源码](https://github.com/jackwoo725-ux/douyin-downloader/blob/main/backend/douyin.py) 的 `_strategy_share_page` 列出这些类型。类型不明时不应无限枚举路径；重定向必须逐跳校验原有允许域名。 |

这些候选最多用于限定的兼容性调查。没有成功返回正确作品的证据时，不应把旧接口、空 SSR JSON 或作者 README 声称的可用性写进产品承诺。`from_ssr=1` 等参数本次没有找到官方语义文档，不将猜测参数当成下一条已证实路径。

## 开源下载器为何不能直接照搬

[RandallAnjie/Douyin-API 作者 README](https://github.com/RandallAnjie/Douyin-API) 明示其实现含 `a_bogus`、`X-Bogus` 签名、Cookie/访客身份初始化，以及媒体代理和可选缓存。另一些解析器的备用策略也依赖内部接口签名。这里只判断依赖，不运行这些流程，不复制其签名、身份生成、媒体代理或缓存机制。开源项目显示“解析下载成功”，不能证明其工作条件符合轻匣现有约束。

## 官方开放平台不是任意分享链接下载 API

[查询授权账号视频列表](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/account-video-list/) 要求 `video.list` 权限及用户授权的 access token，获取的是授权账号的视频。[视频数据接口](https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/video-data/) 同样要求 `video.data` 权限和用户授权，服务于视频数据查询。这里的授权账号与随意粘贴的其他作者视频不能等同；这些文档没有提供一个匿名下载任意分享媒体的替代接口。

[官方 WEB 授权说明](https://open.douyin.com/platform/resource/docs/develop/permission/web/permission) 还要求创建并通过审核的应用，由用户授权后换取 token；无需用户授权的 client token 对应另一类能力，例如生成 share ID。不能将它当成匿名视频读取权限。若未来考虑官方授权账号管理，应另行确认产品范围；本轮不新增普通用户登录体系。

## 下载成功的后续验收条件

只有解析出目标作品真实媒体后，才开始媒体链路验收：在轻匣实际域名浏览器中检查请求、重定向、CORS、媒体类型及真实下载文件是否可打开。服务端拿到 URL 或 HTTP 200 仅属于前一步。全程保留当前域名/SSRF 限制、超时及大小限制，不保存签名 URL，不伪造身份、不增加媒体中转。

若无匿名公开数据，就应保留实验性标识及明确阶段错误；若只能打开官方页面，则入口名称应为“打开原页面”，不能算作文件下载已完成。
