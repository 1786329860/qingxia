import { cp, mkdir, access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.cwd();
const copy = async (from, to) => {
  await access(join(root, from));
  await mkdir(join(root, to, '..'), { recursive: true });
  await cp(join(root, from), join(root, to), { recursive: true });
};
await copy('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'public/ffmpeg/ffmpeg-core.js');
await copy('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'public/ffmpeg/ffmpeg-core.wasm');
await copy('node_modules/pdfjs-dist/cmaps', 'public/vendor/pdfjs/cmaps');
await copy('node_modules/pdfjs-dist/standard_fonts', 'public/vendor/pdfjs/standard_fonts');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const licenses = [];
for (const name of Object.keys(pkg.dependencies)) {
  const packageRoot = join(root, 'node_modules', name);
  const meta = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  const folder = name.replaceAll('/', '__').replace('@', '');
  const texts = (await readdir(packageRoot)).filter((name) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(name),
  );
  for (const text of texts)
    await copy(`node_modules/${name}/${text}`, `public/licenses/${folder}/${text}`);
  licenses.push({
    name,
    version: meta.version,
    license: meta.license || 'See upstream',
    source: typeof meta.repository === 'string' ? meta.repository : meta.repository?.url,
    files: texts.map((file) => `${folder}/${file}`),
  });
}
await copy('licenses/GPL-2.0.txt', 'public/licenses/ffmpeg-core/GPL-2.0.txt');
const ffmpeg = JSON.parse(
  await readFile(join(root, 'node_modules/@ffmpeg/core/package.json'), 'utf8'),
);
licenses.push({
  name: ffmpeg.name,
  version: ffmpeg.version,
  license: ffmpeg.license,
  source: ffmpeg.repository.url,
  files: ['ffmpeg-core/GPL-2.0.txt'],
});
await writeFile(join(root, 'public/licenses/index.json'), JSON.stringify(licenses, null, 2));
console.log('已准备同站 FFmpeg 与 PDF 字体资源。');
