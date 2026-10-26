# 第三方依赖与分发

依赖的准确版本记录在 `package-lock.json`。部署者应保留 npm 包所附许可证、版权信息及源码获取方式。

- React、Vite、pdf-lib、PDF.js、fflate、PapaParse、QRCode、hash-wasm、Lucide、Recharts、Supabase JS 等依赖分别遵循其包内 LICENSE。
- AVIF 本地编解码使用 `@jsquash/avif`，及其所带的 libavif、AOM 等组件。请同时保留包中的上游许可证。
- `@ffmpeg/ffmpeg` 是 FFmpeg 的浏览器 WASM 接口；`@ffmpeg/core` 所分发 FFmpeg 核心具有其自身许可要求，不能仅按 JavaScript 包装器许可理解。所用核心来源为官方 ffmpeg.wasm 发布包，未修改核心。

FFmpeg 与核心构建源码：

- https://github.com/ffmpegwasm/ffmpeg.wasm
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build
- https://ffmpeg.org/legal.html

构建脚本会将主要依赖的 LICENSE/COPYING 文件复制到 `dist/licenses/`，并提供 `/licenses/index.json` 索引。对于具体二进制的完整许可义务，部署者应结合所分发版本及其构建配置核对；此文件不替代上游许可文本。
