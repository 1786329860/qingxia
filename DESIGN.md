---
name: 轻匣
description: 白瓷浮光与轻量工具工作台
colors:
  dark-bg: '#121315'
  dark-sidebar: '#16181b'
  dark-surface: 'rgba(26, 28, 32, 0.84)'
  dark-surface-raised: '#22252a'
  dark-surface-hover: '#282c32'
  dark-text: '#f3efe8'
  dark-muted: '#a69f95'
  dark-subtle: '#a0988d'
  dark-line: 'rgba(243, 239, 232, 0.08)'
  dark-line-strong: 'rgba(243, 239, 232, 0.15)'
  dark-accent: '#ede6da'
  dark-accent-text: '#151618'
  dark-accent-dim: 'rgba(237, 230, 218, 0.08)'
  dark-accent-border: 'rgba(237, 230, 218, 0.28)'
  dark-danger: '#e48b74'
  light-bg: '#f6f4ee'
  light-sidebar: '#f2efe8'
  light-surface: 'rgba(255, 254, 251, 0.86)'
  light-surface-raised: '#fdfcf9'
  light-surface-hover: '#ffffff'
  light-text: '#1c1a17'
  light-muted: '#5c564e'
  light-subtle: '#70685e'
  light-line: 'rgba(46, 40, 32, 0.075)'
  light-line-strong: 'rgba(46, 40, 32, 0.14)'
  light-accent: '#2c2721'
  light-accent-text: '#fbf9f5'
  light-accent-dim: 'rgba(44, 39, 33, 0.06)'
  light-accent-border: 'rgba(44, 39, 33, 0.22)'
  light-danger: '#a84832'
typography:
  display:
    fontFamily: "'Qingxia Song', 'Noto Serif SC', 'Songti SC', serif"
    fontSize: 'clamp(24px, 2.2vw, 30px)'
    fontWeight: 500
    lineHeight: 1.28
    letterSpacing: '0.02em'
  headline:
    fontFamily: "Inter, 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: 'clamp(24px, 2.2vw, 30px)'
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
  search: '14px'
  tool-panel: '26px'
  card: '20px'
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
    height: '46px'
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

# 轻匣视觉规范

## 首页与导航

白瓷、半透明折射与暖纸构成首页。宽屏从左到右布置工具目录和搜索、悬浮白瓷匣子、折角便笺。中等屏幕将便笺放到下一行。760px 以下先展示品牌文案和搜索，分类压成两行，接着展示匣子和便笺。

顶部展示站点名和主要操作，底部保留常用入口。折叠导航覆盖完整功能。抽屉和快速搜索打开时将键盘焦点留在弹层，关闭后还给触发控件。

## 字体与表面

浅色使用暖白基底、炭色文字和淡虹彩，深色使用墨黑釉面、暖灰文字和较低亮度的虹彩。首页标题用本地宋体子集及系统宋体回退，界面正文用系统无衬线，代码和序号用等宽字体。工具、账号和后台用同一套语义颜色，操作提示优先使用易懂的中文。

立体高光主要用于首页匣子、折角便笺、导航圆石和账号卡。上传区、进度和图表保持稳定，状态以文字或图标明确表达。示例统计必须明确标识。

## 动效与状态

首页场景单独加载。页面不可见或场景滚出视口时暂停，设备预算不足或用户减少动态时使用静态场景。主题变化不重建工具组件，文件和处理状态留在原任务中。保留系统光标、正常滚动和键盘操作。

当前实现见 `src/workspace.css`、`src/components/breathing-box.css`、`src/components/task-surfaces.css` 和各页对应样式。旧墨绿版本的记录见 [2026-10-27 视觉升级交付](docs/VISUAL_UPGRADE_2026-10-27.md)。
