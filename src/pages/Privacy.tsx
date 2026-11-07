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
          抖音和 Suno
          工具只把提取出的分享链接发送给本站解析接口，返回可用的媒体链接和必要信息。解析接口不接收文件、不保存媒体，也不记录完整分享链接或媒体直链。Suno
          音轨在浏览器提取，不经过本站服务器。
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
          IP。
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
        <h2>账号、留言与表情包</h2>
        <p>
          轻匣使用 Supabase
          保存账号邮箱、密码散列和会话数据。邮箱用于验证注册和找回密码。站长只能看到账号统计，留言墙仅显示你填写的昵称、留言、时间与站长回复。请勿在留言里填写个人敏感信息。
        </p>
        <p>
          可以删除自己的留言。站长可以回复和管理留言，以及上传供所有访客下载的
          GIF。工具处理的文件仍然只留在你的浏览器。
        </p>
        <p>
          轻匣统计已验证注册数、成功登录次数，以及统计区间内去重的活跃账号数。活跃统计每天最多保存一个账号日期记录，保留最近
          93 个自然日，并遵从下方统计开关和浏览器的 Do Not
          Track。账号注册与登录还会产生服务商的安全审计日志。
        </p>
      </section>
      <section>
        <h2>预约贺卡邮件</h2>
        <p>
          预约发信会保存收件邮箱、称呼、正文、模板和发送时间。预约只对发件账号可见。发给他人的邮件需要收件人使用对应邮箱登录确认，邮件由轻匣的发件服务按预约发送。
        </p>
        <p>
          在开始发送前可以取消预约。发送、取消、失效或失败等已结束记录保留 30
          天。收件邮箱和正文不会计入网站统计。
        </p>
      </section>
      <section>
        <h2>只保存在这个浏览器</h2>
        <p>
          收藏、最近使用、主题设置和统计偏好仅存在本地。每日匿名访客标识也保存在本地并每日轮换。更换浏览器、清除站点数据或使用无痕模式后，原有设置可能不再可用。
        </p>
      </section>
      <p className="muted">
        版本 0.1.0 · 如你不同意某项网络操作，可关闭统计并使用纯本地工具，不必使用链接解析。
      </p>
    </article>
  );
}
