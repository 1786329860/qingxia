import { Link } from 'react-router-dom';
import { Box, ArrowUpRight, Sparkles } from 'lucide-react';
import { tools, categories } from '../lib/registry';
export default function About() {
  return (
    <article className="prose-page">
      <div className="page-kicker">
        <Box size={16} />
        一只小匣子，装下日常的可能
      </div>
      <h1>轻一点，也好用一点。</h1>
      <p className="page-lead">轻匣，把日常小事，轻轻解决。</p>
      <section>
        <h2>小工具，也值得被认真设计。</h2>
        <p>
          不用为了压缩一张图片、整理一份 PDF，或校验一段
          JSON，在不同网站之间反复跳转。我们把这些小事放进同一个干净的盒子里：免费使用，没有广告。注册并验证邮箱后即可使用工具。
        </p>
        <p>
          能在本地完成的，就留在你的浏览器。重处理引擎只在需要时加载。每个工具都有自己的使用边界，我们会如实说明。
        </p>
      </section>
      <section>
        <h2>
          <Sparkles size={21} />
          现在，匣子里有什么
        </h2>
        <p>
          当前版本 0.1.0 · {tools.length} 项工具，包含六类纯本地趣味工具、Suno
          官方下载入口和实验性抖音链接解析。不提供 AI 生成或付费接口功能。
        </p>
        {categories.map((category) => (
          <div key={category.id} className="about-tool-group">
            <h3>{category.label}</h3>
            <div className="chips">
              {tools
                .filter((t) => t.category === category.id)
                .map((tool) => (
                  <Link key={tool.id} to={`/tool/${tool.id}`}>
                    {tool.name}
                    <ArrowUpRight size={12} />
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </section>
      <section>
        <h2>关于兼容性</h2>
        <p>
          请使用新版浏览器。大文件、4K
          视频和长时间音视频处理建议在桌面设备运行。压缩不保证每个文件都会变小；格式支持取决于工具所用的本地编解码器。PDF
          合并、拆分和重新生成可能使数字签名失效，请保留原始文件。
        </p>
        <p>工具用于日常便利，不替代专业软件。请先用副本处理重要文件，并在使用结果前检查内容。</p>
      </section>
      <section>
        <h2>到留言墙聊聊</h2>
        <p>
          有功能建议，或想要一款新的表情包？欢迎在<Link to="/wall">轻匣留言墙</Link>贴一张便利贴。
        </p>
      </section>
      <Link className="button button-secondary" to="/privacy">
        了解隐私说明
        <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}
