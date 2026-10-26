import { zipSync } from 'fflate';
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadText(text: string, name: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), name);
}
export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '');
}
export async function createZipBlob(files: { name: string; blob: Blob }[]) {
  const entries: Record<string, Uint8Array> = Object.create(null);
  for (const file of files) {
    const safeName = file.name.replace(/[/\\\x00-\x1f]/g, '_');
    const original = safeName && safeName !== '.' && safeName !== '..' ? safeName : '文件';
    let key = original;
    let suffix = 2;
    while (key in entries) key = `${suffix++}-${original}`;
    entries[key] = new Uint8Array(await file.blob.arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' });
}
export async function downloadZip(
  files: { name: string; blob: Blob }[],
  name = '轻匣-处理结果.zip',
) {
  downloadBlob(await createZipBlob(files), name);
}
export function checkFileSize(file: File, maxMB = 50) {
  if (file.size > maxMB * 1024 * 1024)
    throw new Error(`「${file.name}」超过 ${maxMB} MB 限制，请选择较小文件。`);
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '处理失败，请检查输入后重试。';
}
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement('textarea');
    input.value = value;
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('浏览器未允许复制，请手动选择并复制结果。');
  }
}
