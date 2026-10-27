---
name: 轻匣
description: 墨绿工作空间中的会呼吸的数字匣子
colors:
  dark-bg: '#0a1412'
  dark-sidebar: '#0b1713'
  dark-surface: '#11211b'
  dark-surface-raised: '#1a2d23'
  dark-surface-hover: '#193024'
  dark-text: '#f0f3e9'
  dark-muted: '#a5b6aa'
  dark-subtle: '#8b9f91'
  dark-line: '#b7d7bc12'
  dark-line-strong: '#b7d7bc29'
  dark-accent: '#c3f588'
  dark-accent-text: '#162910'
  dark-accent-dim: '#c3f5880b'
  dark-accent-border: '#c3f58845'
  dark-danger: '#f3ae8c'
  light-bg: '#f3f6ef'
  light-sidebar: '#eaf0e5'
  light-surface: '#fcfdf8'
  light-surface-raised: '#e3ebdc'
  light-surface-hover: '#eaf1e2'
  light-text: '#20382b'
  light-muted: '#52675a'
  light-subtle: '#5e7364'
  light-line: '#2c53351a'
  light-line-strong: '#2c533530'
  light-accent: '#467022'
  light-accent-text: '#fff'
  light-accent-dim: '#5a852a0b'
  light-accent-border: '#5a852a50'
  light-danger: '#ac4a25'
typography:
  display:
    fontFamily: "'Qingxia Song', 'Noto Serif SC', 'Songti SC', serif"
    fontSize: 'clamp(40px, 4.1vw, 64px)'
    fontWeight: 500
    lineHeight: 1.28
    letterSpacing: '0.02em'
  headline:
    fontFamily: "Inter, 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: 'clamp(40px, 4.1vw, 64px)'
    fontWeight: 560
    lineHeight: 1.28
    letterSpacing: '-0.025em'
  title:
    fontFamily: "Inter, 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: '17px'
    fontWeight: 550
    lineHeight: 1.55
    letterSpacing: '0.015em'
  body:
    fontFamily: "Inter, 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: '14px'
    lineHeight: 1.75
  label:
    fontSize: '13px'
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: '0.3px'
  code:
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace"
    fontSize: '14px'
    lineHeight: 1.9
rounded:
  field: '7px'
  nav: '8px'
  segmented: '9px'
  feedback: '10px'
  search: '12px'
  tool-panel: '13px'
  card: '14px'
  task: '16px'
  gate: '18px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  2xl: '32px'
  3xl: '48px'
components:
  button-primary:
    backgroundColor: '{colors.dark-accent}'
    textColor: '{colors.dark-accent-text}'
    typography: '{typography.label}'
    rounded: '{rounded.field}'
    padding: '10px 16px'
  button-primary-light:
    backgroundColor: '{colors.light-accent}'
    textColor: '{colors.light-accent-text}'
    typography: '{typography.label}'
    rounded: '{rounded.field}'
    padding: '10px 16px'
  button-secondary:
    backgroundColor: '{colors.dark-surface-raised}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.field}'
    padding: '10px 16px'
  search:
    backgroundColor: '{colors.dark-surface}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.search}'
    padding: '0 19px'
    height: '60px'
  tool-card:
    backgroundColor: '{colors.dark-surface}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.card}'
    padding: '24px 24px 18px'
  task-result:
    backgroundColor: '{colors.dark-bg}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.card}'
    padding: '24px'
  admin-gate:
    backgroundColor: '{colors.dark-surface}'
    textColor: '{colors.dark-text}'
    rounded: '{rounded.gate}'
    padding: '44px 40px 30px'
    width: 'min(100%, 480px)'
---

# Design System: 轻匣

## Overview

**Creative North Star: “会呼吸的数字匣子”**

墨绿工作空间承载真实工具，荧光浅绿标记可以行动的位置。首页左侧的中文标题、说明和搜索保持直接；右侧玻璃匣子的面、折射、内核与悬浮薄盖提供品牌记忆。材质集中在这个对象上，工具区域以实体表面、精确边线和清楚的文字层级组织任务。

浅色主题采用矿物白、墨绿文字与翡翠冰玻璃，并为正文、分隔线、强调色和图表重新赋值。本文记录 2026-10-27 本地实现，来源为 `src/workspace.css`、`src/components/breathing-box.css`、`src/components/task-surfaces.css`、`src/pages/admin-surfaces.css` 及对应组件；`src/styles.css` 保留基础表单、按钮和代码字型。它记录代码规则，不代表截图、真实手机、外部评选或性能指标已经通过验证。

**Key Characteristics:**

- 中文无衬线任务文字，首页第二行标题加入本地宋体细节。
- 墨绿与荧光浅绿的主从关系，浅色主题拥有独立颜色。
- 主视觉有立体材质；列表、表单和后台保持可扫描的实体层级。
- 内容直接可见，动效附着于已有组件，装饰服从设备和用户偏好。

## Colors

颜色的规范值在 frontmatter；暗色值对应默认 `:root`，浅色值对应 `:root[data-theme='light']`，运行时由相同语义 CSS 变量切换。

### Primary

- **荧光嫩绿**（`dark-accent`）：主按钮、标题第二行、焦点、收藏及进度；按钮文字使用 `dark-accent-text`。
- **苔绿**（`light-accent`）：浅色主题的同一交互角色，按钮文字使用 `light-accent-text`。
- `accent-dim` 与 `accent-border` 分别提供低浓度底色和强调边界，不用整片荧光填满任务区。

### Neutral

- `bg` 是页面基底；`sidebar` 以轻微色差形成固定导航带；`surface` 承载工具卡片、面板和图表。
- `surface-raised` 用于选中导航、次按钮及反馈；`surface-hover` 用于指针悬停。
- `text` 承载主文字，`muted` 承载可读说明，`subtle` 承载补充信息；`line` 与 `line-strong` 区分内部细线和容器边界。
- 错误沿用 `danger`：暗色暖杏、浅色赭色；错误同时使用文字和 `role="alert"`。

### Named Rules

**独立浅色规则。** 浅色主题直接覆盖语义 token，并独立调整玻璃反射、内核、地面光和图表颜色。不得用滤镜将暗色截图翻为浅色界面。

**分类着墨规则。** 工具图标与卡片上沿细光可携带分类颜色，卡片正文和任务按钮仍使用语义主色。暗色分类墨色依次为图片 `#b5d5a5`、PDF `#e2b2a0`、媒体 `#c6b8e8`、文本 `#a8cce7`、转换 `#d8c896`、开发 `#94d3c0`、趣味 `#c3df89`、链接 `#dfadcc`。浅色为图片 `#3e6c31`、PDF `#914930`、媒体 `#655186`、文本 `#315e84`、转换 `#7a6024`、开发 `#316e60`、链接 `#8d4575`；趣味类沿用浅色卡片默认墨色。

## Typography

**Display Font:** 首页“轻轻解决。”使用 `Qingxia Song` CSS 别名，实际文件为 Noto Serif SC 500 子集 `public/fonts/qingxia-heading-subset.ttf`，5,300 bytes，`font-display: swap`。许可证为同目录 `OFL-NotoSerifSC.txt` 的 SIL Open Font License 1.1；来源记录见 `public/fonts/README.md`。字体随站点本地部署，子集仅含首页标题所需字符，不把它当完整中文字库。

**Body Font:** 系统无衬线栈，依序尝试 Inter、SF Pro Display、Apple/Blink 系统字体、Segoe UI、苹方、Hiragino Sans GB、微软雅黑和通用 sans-serif。代码未为这些名称加载额外网络字体。

**Code Font:** SFMono-Regular、Consolas、Liberation Mono、monospace。后台指标、表格和进度采用 `tabular-nums`，指标另启用 `lining-nums`。

### Hierarchy

- **首页标题：** 桌面 `clamp(40px, 4.1vw, 64px)` / 1.28；第一行字重 560、字距 −0.025em，宋体第二行字重 500、字距 0.02em。761–1100px 为 42px；≤760px 为 `clamp(33px, 8.7vw, 43px)` / 1.3；≤360px 为 31px。
- **页面标题：** 工具页 34px / 550，移动端 28px / 1.4；收藏与最近使用 32px，移动端 25px / 1.45；后台标题 `clamp(28px, 2.7vw, 40px)` / 1.35 / 600，≤620px 为 29px。
- **卡片标题：** 桌面 17px / 1.55 / 550，移动端 18px；卡片正文 14px / 1.75，移动端行高 1.8。
- **说明与标签：** 首页说明 15px / 1.85，较窄屏幕 14px；导航 13px，分类、隐私和多种辅助文字 12px；任务字段标签 13px / 1.8。工具输入桌面 14px，移动基础输入 16px，避免把输入区压成微小文字。
- **现状例外：** 计数、处理模式、部分侧栏辅助字仍为 11px；品牌英文 9px、版本 10px、场景注记移动端 10px/极窄屏 9px。这些是现有辅助或装饰尺寸，不作为新增正文的规范。

## Layout

桌面以左侧栏和右侧工作区组成。侧栏宽 220px，761–1100px 收为 202px；顶栏高 80px。内容上限 1520px，常规左右内边距 48px，761–1100px 为 30px。首页首段是 `1.1fr / 1fr` 两列，间隙 18px、最小高度 512px；文字和搜索在左，432px 高的场景在右。搜索最大宽度 510px，工具集合由上分隔线承接。

工具网格常规三列、间隙 16px；761–1100px 为两列。≤760px 变为单列、间隙 12px，内容左右留 22px，≤360px 留 18px。首页按文字、搜索、场景、工具顺序排列；场景高 280px，极窄屏为 260px。移动分类横向原生滚动，排序控件隐藏，不接管页面滚轮。

≤760px 导航变为宽 278px 的抽屉，顶栏高 64px。关闭状态侧栏无阴影并且 `inert` / `aria-hidden`；仅打开时渲染关闭遮罩和侧向投影。打开后锁定页面滚动、约束 Tab 焦点，Escape 或遮罩可关闭，并恢复原焦点。

常用间距为 4、8、12、16、24、32、48px，同时保留针对文字和构图的 18、20、22、26、28、30px 等实际值。卡片桌面内边距 `24px 24px 18px`，移动为 `22px 22px 16px`，≤360px 横向 19px。后台指标四列、1px 分隔；≤1100px 为两列，图表从 `1.65fr / 1fr` 变为单列。≤620px 日期筛选成为两日期输入与 44px 刷新按钮的网格，表格在自身容器横向滚动，首列保持可见。任务上传区 ≤540px 降低高度及内边距。

## Elevation & Depth

深度由表面色阶、细边界和局部柔和阴影共同形成。工具卡片和后台图表常态无外投影，避免将每个功能都变成玻璃物体。玻璃立方体通过面片透明度、渐变、反射和内核明暗构成立体材质，边线只解释边缘。

### Shadow Vocabulary

- **常规低层投影：** 暗色 `0 14px 38px #00000020`，浅色 `0 14px 38px #253e2710`；工具面板和收藏反馈使用 `--shadow`。
- **移动抽屉：** 仅打开时使用 `20px 0 70px #00000038`；遮罩为 `#04100b88` 与 3px 背景模糊。
- **后台入口：** `0 18px 42px color-mix(in srgb, var(--bg) 68%, transparent)`；图表提示框采用 `0 10px 24px color-mix(in srgb, var(--bg) 45%, transparent)`。
- **表面微光：** 搜索框使用 `inset 0 1px 0 #ffffff05`；结果框使用 `inset 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent)`，不将微光升级为泛屏光晕。

## Shapes

任务界面以圆角矩形为主：基础按钮与输入 7px、导航与分类 8px、搜索 12px、工具面板 13px、工具卡片与结果框 14px、上传区与图表 16px、后台验证卡 18px。主题按钮和收藏按钮使用圆形触点。品牌玻璃对象保持有六个面的立方体与薄盖轮廓；它的形状不移植到每个任务容器。

## Components

### Buttons, search and navigation

主按钮使用 `accent / accent-text`，次按钮使用 `surface-raised / text`，ghost 按钮使用透明底与 `muted`。基础按钮桌面最小高度 41px、13px 字号、`10px 16px` 内边距；移动最小高度 42px、横向 14px。禁用状态使用禁用属性和 0.48 透明度，忙碌动作同时设置 `aria-busy` 与进度光标。

桌面搜索高 60px、圆角 12px，移动高 57px、圆角 11px。聚焦时边线变为 accent，底色变为 surface-raised。支持 `/`、Ctrl/Cmd+K 聚焦，输入 Enter 滚动到真实工具列表。导航选中用实体抬高表面与强调图标表达，不依赖左侧发光线。

键盘焦点统一保留 2px accent 描边、5px 外间距；上传区有同等焦点反馈。系统光标和原生滚动保持可用。

### Tool cards and favorites

工具卡片承载真实名称、说明、分类和本地/链接处理标记；主链接进入工具页，收藏按钮独立。细指针 hover 轻抬 3px、边界变亮，触屏不依赖 hover 才能看见操作。收藏有按压缩放、填充心形、300ms 回弹以及 1,800ms 的 `role="status" / aria-live="polite"` 状态；收藏与最近使用记录保存在当前浏览器。

### Task surfaces and feedback

上传区使用实底与双层细框，拖入文件时边界变为 accent、内框收进、图标上移；禁用时停止接收文件。拖放、文件按钮与提示属于同一个实际输入流程，文件选择本身不伪装成上传完成。

`ActionButton` 的忙碌状态来自任务；`Progress` 将真实传入值约束在 0–100，并以 `scaleX` 和可访问进度值同步展示。复制在剪贴板调用成功后显示“已复制”，失败使用 alert。下载仅反馈“已请求下载，请在浏览器中查看文件”，不声称操作系统已经写入成功。`ResultBox` 使用带关联标题的 section。

`SiteShell` 只通过 `data-theme` 与样式改变主题，路由内容的动画通过现有 DOM 的 Web Animations 执行；工具 View 不由主题或动画状态生成新的 React key。任务页边界只按工具 id 区分，保持进行中的组件身份。

### Signature: BreathingBox

外层玻璃、内核、薄盖各有 front/back/left/right/top/bottom 六个面，使用 `preserve-3d`。常规玻璃边长 176px、内核 64px、盖宽 184px/厚 8px，透视 900px；≤640px 为 128/46/134px 与 700px 透视。暗色玻璃面为 `rgba(141, 199, 163, 0.2)` 至 `rgba(5, 47, 36, 0.34)` 的渐变，浅色为 `rgba(225, 255, 239, 0.64)` 至 `rgba(79, 153, 114, 0.12)`，反射另用亮白值。薄盖与箱体分离，地面椭圆光和前后两段细轨道提供空间关系。

Canvas 2D 只绘制少量三轨道微光：full 30、compact 18、static 10 粒子。绘制和指针/滚动 CSS 变量更新上限为 30fps，CSS 悬浮是独立的 8s/12px 呼吸。full DPR 上限 1.75，其他模式 1.25；宽度 <640px 或无法读取核心数时使用 compact。省流、核心数 ≤4、设备内存 ≤2GB、减少动态效果使用静态材质；Canvas 不可用或持续超预算也回退静态。预算条件为至少 60 个有效 rAF 间隔中超过 40ms 的比例大于 45%，运行中按 90 个间隔窗口检查。该逻辑是降级策略，不是性能已达标的证明。

离开视口（IntersectionObserver 阈值 0.03）或页面隐藏会取消 rAF 并暂停 CSS 悬浮，恢复可见后再运行。组件卸载取消帧、断开可见性/尺寸/主题观察器，移除滚动、指针、resize 和偏好监听，并清空 Canvas、将尺寸缩至 1×1。装饰 `aria-hidden` 且不阻挡输入；仅鼠标可驱动小幅倾斜，触屏不模拟鼠标交互。

### Motion timing

主要导航、分类、卡片、搜索、任务反馈与后台交互采用 240ms 和 `cubic-bezier(0.2, 0.8, 0.2, 1)`；路由和分类网格仅作 5px 位移与明度进入，不等待离场。实际时序另有基础按钮 150ms、进度变换 180ms、收藏回弹 300ms、移动抽屉 320ms、主题图标 420ms、基础输入 200ms。减少动态效果跳过路由/网格动画，关闭悬浮并移除任务/后台过渡；全局动画和过渡压至 0.001ms。

### Admin

验证入口保持独立密码表单；普通用户无需登录。示例入口明确标注“预览统计界面（示例数据）”，进入后保留“演示模式”和说明条，导出文件名附带“示例”。真实统计须通过站长验证并从同源 `/api/admin` 读取；未配置服务、401、错误和空状态均有对应 UI，示例不替代真实结果。

指标、图表和使用表格沿用相同实体表面。图表颜色在 `admin-surfaces.css` 中各自定义深浅八色序列，不把图表系列色扩成全站交互色。图表与数值为匿名聚合统计，不能从本地示例截图推断生产流量或后台鉴权已实测。

## Do's and Don'ts

### Do:

- **Do** 从运行时语义变量取色，并分别检查深浅主题文字、边界和状态。
- **Do** 保持搜索、分类、工具入口和真实结果在装饰之外清楚可用。
- **Do** 让成功文案对应真实操作阶段，保留忙碌、失败、无结果与禁用状态。
- **Do** 将标题子集限制在已包含字形的用途，其他中文使用系统字型栈。
- **Do** 在继续新增装饰前复用可见性暂停、减少动态与卸载清理策略。

### Don't:

- **Don't** 将首页玻璃材质扩散到所有卡片、表单和统计容器。
- **Don't** 以装饰、主题或过渡状态为工具组件重新生成 key。
- **Don't** 接管系统光标、滚轮或依靠 hover 才暴露必需操作。
- **Don't** 把演示数据、绘制预算或移动视口截图表述为生产流量、性能通过或真实手机验证。
- **Don't** 将现有 9–11px 的辅助/装饰文字例外推广为正文和新任务标签的字号。
