import { useState } from 'react';
import { ShieldCheck, HardDrive, BarChart3, Link2 } from 'lucide-react';
export default function Privacy() {
  const [off, setOff] = useState(() => {
    try {
      return localStorage.getItem('qingxia:analytics-off') === 'true';
    } catch {
      return true;
    }
  });
  return (
    <article className="prose-page">
      <div className="page-kicker">
        <ShieldCheck size={16} />
        隐私优先 · 安心使用
      </div>
      <h1>隐私，放在第一位。</h1>
      <p className="page-lead">你的文件属于你。轻匣只帮你把事情做好。</p>
      <section>
        <h2>
          <HardDrive size={22} />
          文件在本地处理
        </h2>
        <p>
          图片、PDF、视频音频、文本、编码和计算工具在你的浏览器中运行。文件与输入正文不会上传到轻匣服务器，也不会被写入服务器日志。处理引擎、字体和程序资源可能需要联网加载，这不涉及上传你的文件。
        </p>
        <p>
          结果保存在浏览器内存，只有点击下载才会保存到你的设备。清空、离开页面或关闭浏览器后，相关内存资源会被释放。轻匣不会将文件内容主动写入浏览器持久存储。
        </p>
      </section>
      <section>
        <h2>
          <Link2 size={22} />
          链接解析的边界
        </h2>
        <p>
          抖音解析会把你主动提交的分享链接发送给本站解析接口，由服务器访问支持的平台并返回可用的媒体链接和元数据。服务器不接收用户文件上传，也不持久保存媒体内容。解析接口不记录完整分享链接或媒体直链。
        </p>
        <p>
          下载会访问媒体所在的第三方平台，该平台可能收到你的 IP
          和常规网络请求信息。下载与解析受平台的可访问性、跨域和防盗链策略限制。
        </p>
      </section>
      <section>
        <h2>
          <BarChart3 size={22} />
          少量、匿名的使用统计
        </h2>
        <p>
          为了了解哪些工具真正有用，轻匣会记录页面路径、工具标识、处理成功或失败，以及事件发生时间。不会统计文件名、文件大小、文件内容、输入文字、生成结果、完整分享链接或浏览历史。
        </p>
        <p>
          访客使用每天更新的随机浏览器标识，在服务端再次散列。访客数指同一浏览器当日去重后的近似数量，不等同于真实人数；多日访客数据为日访客数之和。服务端限流使用加密散列后的网络标识，不向站长展示原始
          IP。站长后台受独立密码保护。
        </p>
        <p>
          托管、网络与数据库服务商可能产生必要的基础访问或运行日志。轻匣不加入广告和第三方追踪脚本。遵从浏览器的
          Do Not Track 信号；你也可以在此关闭匿名统计。
        </p>
        <label className="check-label privacy-toggle">
          <input
            type="checkbox"
            checked={off}
            onChange={(e) => {
              setOff(e.target.checked);
              try {
                localStorage.setItem('qingxia:analytics-off', String(e.target.checked));
              } catch {
                /* restricted storage */
              }
            }}
          />
          <span>关闭此浏览器的匿名使用统计</span>
        </label>
        <p>统计原始事件计划保留 90 天。部署者应按说明启用自动清理；不启用时不能保证自动删除。</p>
      </section>
      <section>
        <h2>只保存在这个浏览器</h2>
        <p>
          收藏、最近使用、主题设置和统计偏好仅存在本地。每日匿名访客标识也保存在本地并每日轮换。更换浏览器、清除站点数据或使用无痕模式后，原有设置可能不再可用。没有注册、用户账号或云端同步。
        </p>
      </section>
      <p className="muted">
        版本 0.1.0 · 如你不同意某项网络操作，可关闭统计并使用纯本地工具，不必使用链接解析。
      </p>
    </article>
  );
}
